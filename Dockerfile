# ─────────────────────────────────────────────────────────────
# Stage 1: Builder
# ─────────────────────────────────────────────────────────────
FROM node:20-bullseye AS builder

WORKDIR /app

# Install dumb-init
RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

# Install dependencies (cached properly)
COPY package.json package-lock.json ./
RUN npm ci

# Copy prisma first (needed for generate)
COPY prisma/ ./prisma/
RUN npx prisma generate

# Copy source code
COPY src/ ./src/

# ✅ Copy templates AFTER src (important for cache busting)
COPY templates/ ./templates/

# Copy tsconfig
COPY tsconfig.json ./

# Build project
RUN npm run build

# Remove dev dependencies
RUN npm prune --production


# ─────────────────────────────────────────────────────────────
# Stage 2: Runtime
# ─────────────────────────────────────────────────────────────
FROM node:20-bullseye

WORKDIR /app
ENV NODE_ENV=production

# Copy dumb-init
COPY --from=builder /usr/bin/dumb-init /usr/local/bin/dumb-init

# Copy required files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# ✅ Ensure latest templates are copied
COPY --from=builder /app/templates ./templates

# Create non-root user
RUN useradd -m nodejs
USER nodejs

EXPOSE 3004

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]