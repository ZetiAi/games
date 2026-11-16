#!/usr/bin/env bash
# End-to-end tests, including "players resume their matches after the
# environment is stopped and started again".
#
# Runs in its own Compose project (games-test) with its own data volume, so it
# does not touch, or need the ports of, a running development environment.
#
#   scripts/test-e2e.sh              run everything
#   KEEP_STACK=1 scripts/test-e2e.sh leave the test stack running afterwards
set -euo pipefail
cd "$(dirname "$0")/.."

export BUILDX_CONFIG="${BUILDX_CONFIG:-$PWD/.docker-buildx}"

PLAYWRIGHT_VERSION="$(sed -n 's/.*"@playwright\/test": *"\([0-9][0-9.]*\)".*/\1/p' package.json)"
if [ -z "$PLAYWRIGHT_VERSION" ]; then
	echo "package.json must pin @playwright/test to an exact version (it selects the browser image)" >&2
	exit 1
fi
export PLAYWRIGHT_VERSION
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
# Periodic snapshots are switched off for the normal stop/start checks, so
# those prove that the export made while stopping is enough on its own.
export SNAPSHOT_INTERVAL_SECONDS=0

compose() { docker compose -p games-test -f docker-compose.yml -f docker-compose.test.yml "$@"; }
# --no-deps: the environment is already up, and must not be touched (e.g.
# recreated) as a side effect of running the tests.
playwright() { compose run --rm --no-deps e2e test "$@"; }
# Writes to the emulators directly, or checks what was written (see the script).
probe() {
	compose run --rm --no-deps --entrypoint node e2e \
		tests/shutdown/acknowledged-writes.mjs "$1" /e2e/state/acknowledged.json
}
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
up() { compose up -d --wait firebase ai web; }

finish() {
	status=$?
	trap - EXIT
	if [ "$status" -ne 0 ]; then
		step "FAILED (exit $status): last log lines of the emulators and the app"
		compose logs --no-color --tail=60 firebase web || true
		echo "Screenshots and traces: .e2e/results"
	fi
	if [ -z "${KEEP_STACK:-}" ]; then
		compose down --volumes --remove-orphans >/dev/null 2>&1 || true
	fi
	exit "$status"
}
trap finish EXIT

# The emulators must have exited on their own, after saving, not been killed.
assert_saved_on_stop() {
	local container exit_code
	container="$(compose ps -a -q firebase)"
	exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$container")"
	if [ "$exit_code" != "0" ] || ! docker logs "$container" 2>&1 | tail -n 20 | grep -q 'state saved'; then
		echo "the emulators did not save their state while stopping (exit code $exit_code)" >&2
		return 1
	fi
}

# Waits for a periodic snapshot that was started after this function was called.
wait_for_snapshot() {
	local metadata=/data/export/firebase-export-metadata.json since taken
	since="$(compose exec -T firebase date +%s)"
	for _ in $(seq 1 60); do
		taken="$(compose exec -T firebase stat -c %Y "$metadata" 2>/dev/null || echo 0)"
		# strictly later than `since` + 1: the snapshot began after the call
		if [ "$taken" -gt "$((since + 1))" ]; then return 0; fi
		sleep 1
	done
	echo "no periodic snapshot was written within 60s" >&2
	return 1
}

step "Starting a clean test environment"
compose down --volumes --remove-orphans >/dev/null 2>&1 || true
if [ -d .e2e ]; then
	if [ "$(uname)" = Darwin ]; then
		trash .e2e
	else
		rm -rf .e2e
	fi
fi
mkdir -p .e2e/state .e2e/results
if [ "${SKIP_BUILD:-0}" != 1 ]; then
	compose --profile e2e build # the profile includes the image with the tests
fi
up

step "App tests"
playwright --project=app

step "The emulator dashboard works when opened from another device"
playwright --project=dashboard

step "A stop loses nothing the backend has acknowledged"
probe write &
writer=$!
for _ in $(seq 1 240); do
	[ -e .e2e/state/acknowledged.json.started ] && break
	sleep 0.5
done
[ -e .e2e/state/acknowledged.json.started ] || { echo "the writer never got going" >&2; exit 1; }
compose stop firebase ai web # while documents and accounts are still being written
wait "$writer"
assert_saved_on_stop
up
probe verify

step "Players start their matches"
playwright --project=before-restart

step "Restart 1: docker compose stop / start"
compose stop
assert_saved_on_stop
up
playwright --project=after-restart

step "Restart 2: docker compose down / up (containers are thrown away, the volume is kept)"
compose stop
assert_saved_on_stop
compose down
up
playwright --project=after-restart

step "Restart 3: the emulators are killed without warning; the periodic snapshot is restored"
export SNAPSHOT_INTERVAL_SECONDS=2
up # recreates the emulators with snapshots switched on
playwright --project=after-restart
wait_for_snapshot
compose kill firebase
up
playwright --project=after-restart

step "All tests passed"
