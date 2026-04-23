# ── Build Stage ──
FROM node:20-slim AS builder

# Install OpenSSL for Prisma and dumb-init
RUN apt-get update && apt-get install -y openssl dumb-init && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache dependencies
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline --no-audit

# Generate Prisma Client
COPY prisma/ ./prisma/
RUN npx prisma generate

# Copy templates (used by notification service)
COPY templates/ ./templates/

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Runtime Stage ──
FROM node:20-slim AS runner

# Install OpenSSL and dumb-init
RUN apt-get update && apt-get install -y openssl dumb-init && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/templates ./templates

# Add non-root user for security
RUN useradd -m nodejs && chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3004

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]