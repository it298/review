FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=10000 PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && apt-get update && apt-get install -y --no-install-recommends tini \
    && node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
    && chmod -R a+rX /opt/playwright \
    && rm -rf /var/lib/apt/lists/*
COPY src/ ./src/
USER node
EXPOSE 10000
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.js"]
