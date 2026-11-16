# Firebase Local Emulator Suite (Auth + Firestore + Emulator UI) for local
# development and tests. Everything the emulators need is baked into the image
# so that `docker compose up` works offline after the first build.
FROM node:22-bookworm-slim
COPY --from=oven/bun:1.3.13 /usr/local/bin/bun /usr/local/bin/bun

# The Firestore emulator and the Emulator UI are Java programs.
COPY --from=eclipse-temurin:21-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk \
    PATH=/opt/java/openjdk/bin:$PATH

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Pinned so the environment is repeatable; bump deliberately.
ARG FIREBASE_TOOLS_VERSION=15.34.2
RUN bun install --cwd /opt/firebase "firebase-tools@${FIREBASE_TOOLS_VERSION}"
ENV PATH=/opt/firebase/node_modules/.bin:$PATH

# Keep players (guests in particular) signed in across a restart of the
# emulators; see the comment in the script.
COPY docker/firebase/keep-sessions-on-import.mjs /tmp/keep-sessions-on-import.mjs
RUN node /tmp/keep-sessions-on-import.mjs /opt/firebase/node_modules/firebase-tools/lib/emulator/auth/operations.js \
 && rm /tmp/keep-sessions-on-import.mjs

# /data holds the exported emulator state (accounts, matches, chats, ...).
RUN mkdir -p /data /srv/firebase && chown -R node:node /data /srv/firebase
USER node
WORKDIR /srv/firebase

# Pre-download the emulator binaries into the image (~/.cache/firebase).
RUN firebase setup:emulators:firestore && firebase setup:emulators:ui

COPY --chown=node:node docker/firebase/entrypoint.sh /usr/local/bin/emulators-entrypoint
COPY --chown=node:node docker/firebase/gate.mjs /usr/local/lib/emulators-gate.mjs
COPY --chown=node:node firebase.json firestore.rules firestore.indexes.json .firebaserc ./

ENV FIREBASE_PROJECT=demo-games \
    EMULATOR_DATA_DIR=/data \
    SNAPSHOT_INTERVAL_SECONDS=60

VOLUME /data
EXPOSE 4000 4400 4500 8080 9099 9150

# Healthy = saved state loaded, the emulators answering, and the gate that
# lets clients reach them open (see entrypoint.sh).
HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=12 \
  CMD test -f /tmp/emulators.gate-open \
   && curl -fsS http://127.0.0.1:8080/ >/dev/null \
   && curl -fsS http://127.0.0.1:4400/emulators >/dev/null || exit 1

ENTRYPOINT ["emulators-entrypoint"]
