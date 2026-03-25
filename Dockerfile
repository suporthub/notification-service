# ─── Multi-stage build — notification-service ─────────────────────────────────
# Stage 1: build TypeScript → JS
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ─── Stage 2: lean production image ───────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/node_modules ./node_modules

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

# Health check — notification-service exposes /health on HTTP_PORT (default 3007)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${HTTP_PORT:-3007}/health || exit 1

EXPOSE 3007

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
