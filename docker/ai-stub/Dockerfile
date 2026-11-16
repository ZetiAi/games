# Local stand-in for the AI service (see server.mjs). No dependencies.
FROM node:22-bookworm-slim
WORKDIR /srv
COPY docker/ai-stub/server.mjs ./
USER node
ENV PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=5s --timeout=3s --retries=12 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.mjs"]
