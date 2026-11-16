# Browser tests. The image tag must match the @playwright/test version in
# package.json (the browsers are baked into the image); scripts/test-e2e.sh
# passes that version in.
ARG PLAYWRIGHT_VERSION
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble

COPY --from=oven/bun:1.3.13 /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /work
COPY package.json bun.lock ./
COPY packages ./packages
RUN bun install --frozen-lockfile

COPY playwright.config.ts ./
COPY tests ./tests

# The tests run as the invoking host user so the reports they write are not
# owned by root; give that user a writable home for the browser.
ENV HOME=/tmp/home
RUN mkdir -p /tmp/home && chmod 1777 /tmp/home

ENTRYPOINT ["bun", "run", "node_modules/@playwright/test/cli.js"]
CMD ["test"]
