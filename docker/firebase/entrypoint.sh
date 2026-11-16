#!/usr/bin/env bash
# Runs the Firebase emulators and keeps their state on disk.
#
# The Auth and Firestore emulators hold everything in memory. To let players
# resume a match after the environment is stopped and started again, this
# script:
#   1. loads the last saved state from $EMULATOR_DATA_DIR/export on start,
#   2. saves on a normal stop (SIGTERM/SIGINT, i.e. `docker compose stop`,
#      `docker compose down`, Ctrl-C),
#   3. additionally snapshots every $SNAPSHOT_INTERVAL_SECONDS so an abnormal
#      stop (crash, kill -9, power loss) loses at most that much play.
#
# A normal stop must not lose anything a client was told has been stored. The
# emulators themselves save first and stop afterwards, and keep answering
# clients in between. So clients never talk to them directly: they go through
# the gate (gate.mjs), which is opened only once the saved state is loaded and
# closed before the final save:
#
#   start:  load saved state -> open gate
#   stop:   close gate       -> save -> exit
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-demo-games}"
DATA_ROOT="${EMULATOR_DATA_DIR:-/data}"
EXPORT_DIR="$DATA_ROOT/export"
WORK_DIR="$DATA_ROOT/work"
CONFIG="${FIREBASE_CONFIG_FILE:-/srv/firebase/firebase.json}"
SNAPSHOT_INTERVAL="${SNAPSHOT_INTERVAL_SECONDS:-60}"
HUB_URL="http://127.0.0.1:4400"
METADATA="firebase-export-metadata.json"
# Ports clients use: Firestore, Auth, and the Firestore websocket of the
# Emulator UI; and the Emulator UI itself, whose connection settings the gate
# corrects for the browser (see gate.mjs). Must match firebase.json.
GATE_PORTS="${GATE_PORTS:-8080 9099 9150}"
export GATE_DASHBOARD_PORT="${GATE_DASHBOARD_PORT:-4000}"
GATE_SCRIPT="${GATE_SCRIPT:-/usr/local/lib/emulators-gate.mjs}"
# Both are also read by the image's HEALTHCHECK.
STARTUP_LOG="${EMULATOR_STARTUP_LOG:-/tmp/emulators.log}"
export GATE_MARKER="${GATE_MARKER:-/tmp/emulators.gate-open}"
READY_MESSAGE="All emulators ready"

log() { echo "[emulators] $*"; }

mkdir -p "$DATA_ROOT" "$WORK_DIR" 2>/dev/null || true
if ! touch "$DATA_ROOT/.write-test" 2>/dev/null; then
	log "ERROR: $DATA_ROOT is not writable by $(id -un) (uid $(id -u)); game data could not be saved."
	exit 1
fi
rm -f "$DATA_ROOT/.write-test" "$GATE_MARKER"

# The emulators write an export to a temp directory inside their working
# directory (firebase-export-<timestamp>...), then delete the old export and
# move the temp directory into its place. Running them from $WORK_DIR keeps
# both on the same filesystem, so that move is a rename rather than a copy.
# If a previous run died between the delete and the rename, the export
# directory is missing but a complete temp directory is still there: put it
# back. (The metadata file is written last, so its presence means "complete".)
shopt -s nullglob
if [ ! -f "$EXPORT_DIR/$METADATA" ]; then
	newest=""
	for dir in "$WORK_DIR"/firebase-export-*/; do
		if [ -f "$dir$METADATA" ] && { [ -z "$newest" ] || [ "$dir" -nt "$newest" ]; }; then
			newest="$dir"
		fi
	done
	if [ -n "$newest" ]; then
		log "recovering interrupted export ${newest%/}"
		rm -rf "$EXPORT_DIR"
		mv "${newest%/}" "$EXPORT_DIR"
	fi
fi
for dir in "$WORK_DIR"/firebase-export-*/; do rm -rf "$dir"; done
shopt -u nullglob

args=(emulators:start --config "$CONFIG" --project "$PROJECT" --only auth,firestore
	--export-on-exit "$EXPORT_DIR")
if [ -f "$EXPORT_DIR/$METADATA" ]; then
	log "restoring saved state from $EXPORT_DIR"
	args+=(--import "$EXPORT_DIR")
else
	log "no saved state in $EXPORT_DIR, starting empty"
fi

# A stop request only raises a flag. Everything else happens in the main flow
# below, one step after the other, so the order "close gate, then save" cannot
# be overtaken by a signal arriving at an awkward moment. Further signals are
# absorbed here too: the emulators treat a second one as "exit now, skip the
# save".
stop_requested=0
trap 'stop_requested=1' TERM INT

# Waits for a child to exit; a signal interrupts `wait`, so keep at it.
wait_for_exit() {
	while kill -0 "$1" 2>/dev/null; do
		wait "$1" 2>/dev/null || true
	done
}

: >"$STARTUP_LOG"
ready() { grep -q "$READY_MESSAGE" "$STARTUP_LOG" 2>/dev/null; }

cd "$WORK_DIR"
firebase "${args[@]}" > >(tee -a "$STARTUP_LOG") 2>&1 &
firebase_pid=$!

snapshot_loop() {
	local sleeper=""
	# A trap only runs between commands, so a snapshot that is already being
	# written finishes before this loop exits.
	trap '[ -n "$sleeper" ] && kill "$sleeper" 2>/dev/null; exit 0' TERM INT
	while :; do
		sleep "$SNAPSHOT_INTERVAL" &
		sleeper=$!
		wait "$sleeper" || true
		if ! curl -fsS -o /dev/null -X POST "$HUB_URL/_admin/export" \
			-H 'Content-Type: application/json' \
			-d "{\"path\":\"$EXPORT_DIR\",\"initiatedBy\":\"periodic-snapshot\"}"; then
			log "periodic snapshot failed"
		fi
	done
}

gate_pid=""
snapshot_pid=""
serving=0

# Stops the helpers; afterwards no client is connected and no snapshot is
# being written.
stop_serving() {
	if [ -n "$gate_pid" ]; then
		kill -TERM "$gate_pid" 2>/dev/null || true
		wait_for_exit "$gate_pid"
		gate_pid=""
		rm -f "$GATE_MARKER"
	fi
	if [ -n "$snapshot_pid" ]; then
		kill -TERM "$snapshot_pid" 2>/dev/null || true
		wait_for_exit "$snapshot_pid"
		snapshot_pid=""
	fi
}

while [ "$stop_requested" -eq 0 ] && kill -0 "$firebase_pid" 2>/dev/null; do
	if [ "$serving" -eq 0 ] && ready; then
		# shellcheck disable=SC2086 # GATE_PORTS is a list
		node "$GATE_SCRIPT" $GATE_PORTS &
		gate_pid=$!
		if [ "$SNAPSHOT_INTERVAL" -gt 0 ] 2>/dev/null; then
			snapshot_loop &
			snapshot_pid=$!
		fi
		serving=1
	fi
	if [ -n "$gate_pid" ] && ! kill -0 "$gate_pid" 2>/dev/null; then
		break
	fi
	# A signal is noticed when this returns, i.e. within half a second.
	sleep 0.5
done

if ! kill -0 "$firebase_pid" 2>/dev/null; then
	# Not asked to stop: the emulators died on their own.
	stop_serving
	status=0
	wait "$firebase_pid" 2>/dev/null || status=$?
	[ "$status" -ne 0 ] || status=1
	log "ERROR: the emulators exited unexpectedly (status $status)"
	exit "$status"
fi

if [ "$serving" -eq 0 ]; then
	# The gate was never opened, so no client has changed anything, and the
	# state in memory may be only partly loaded: keep what is on disk.
	log "stop requested before the emulators finished starting: nothing new to save, keeping the previous state"
	kill -KILL "$firebase_pid" 2>/dev/null || true
	exit 0
fi

exit_status=0
if [ "$stop_requested" -eq 0 ]; then
	# The gate died. Clients can no longer get in, so save what they did and
	# stop, rather than run on unreachable.
	log "ERROR: the gate stopped unexpectedly; saving state and shutting down"
	exit_status=1
else
	log "stop requested: closing client connections, then saving state to $EXPORT_DIR"
fi

stop_serving
stop_marker="$WORK_DIR/.stop-requested"
touch "$stop_marker"
kill -TERM "$firebase_pid" 2>/dev/null || true
wait_for_exit "$firebase_pid"

# Only an export written after the gate was closed counts.
if [ "$EXPORT_DIR/$METADATA" -nt "$stop_marker" ]; then
	rm -f "$stop_marker"
	log "state saved"
	exit "$exit_status"
fi
log "ERROR: the emulators stopped without saving their state to $EXPORT_DIR"
exit 1
