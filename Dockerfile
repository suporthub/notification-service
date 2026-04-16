# Use SAME base image for both stages (IMPORTANT)
FROM node:20-bullseye AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y dumb-init && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY prisma/ ./prisma/
COPY templates/ ./templates/

RUN npx prisma generate

COPY src/ ./src/
RUN npm run build

RUN npm prune --production


# ✅ Use SAME IMAGE (no second pull)
FROM node:20-bullseye

WORKDIR /app
ENV NODE_ENV=production

# Copy dumb-init from builder
COPY --from=builder /usr/bin/dumb-init /usr/local/bin/dumb-init

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