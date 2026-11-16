# The SvelteKit app. Dependencies are installed into the image from the
# lockfile; docker-compose.yml mounts the source over it for live reload.
FROM node:22-bookworm-slim

COPY --from=oven/bun:1.3.13 /usr/local/bin/bun /usr/local/bin/bun

# Runs as root on purpose: the dev setup bind-mounts the working tree, and a
# fixed non-root user could not read it when the host files are private to
# their owner (restrictive umask). Nothing is written back to the mounts.
WORKDIR /app

COPY package.json bun.lock ./
COPY packages ./packages
RUN bun install --frozen-lockfile

COPY . .
RUN bun run node_modules/@sveltejs/kit/svelte-kit.js sync

EXPOSE 5173
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
