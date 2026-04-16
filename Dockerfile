# Stage 1: build
FROM node:20-bullseye AS builder

WORKDIR /app

# ✅ Install dumb-init here where apt works reliably
RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

# ✅ Copy both package.json + lock file
COPY package.json package-lock.json ./

# ✅ Use npm ci (faster + reliable)
RUN npm ci

COPY tsconfig.json ./
COPY prisma/ ./prisma/
COPY templates/ ./templates/

# ✅ Generate prisma
RUN npx prisma generate

COPY src/ ./src/

# ✅ Build project
RUN npm run build

# ✅ Strip dev dependencies before copying to runner
RUN npm prune --production


# Stage 2: production image
FROM node:20-bullseye-slim AS runner

# ✅ Copy dumb-init binary from builder — no apt/curl/wget needed in slim image
COPY --from=builder /usr/bin/dumb-init /usr/local/bin/dumb-init

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/templates ./templates

RUN useradd -m nodejs
USER nodejs

EXPOSE 3004
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]