FROM node:24-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=10000 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && apt-get update && apt-get install -y --no-install-recommends tini \
    && node node_modules/playwright-core/cli.js install --with-deps --only-shell chromium \
    && chmod -R a+rX /opt/playwright \
    && rm -rf /var/lib/apt/lists/*
COPY cloud/ ./cloud/
COPY backend/src/ ./backend/src/
COPY server.js ./
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
USER node
EXPOSE 10000
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
