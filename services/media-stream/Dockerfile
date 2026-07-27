# ─── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer-cache friendly)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ─── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root
RUN addgroup -g 1001 -S appgroup && \
    adduser  -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy only what's needed at runtime
COPY --from=builder --chown=appuser:appgroup /app/dist         ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json

USER appuser

# Render injects PORT automatically; default to 8080
ENV PORT=8080
EXPOSE 8080

# Health check for Docker itself (Render also pings /health via HTTP)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/index.js"]
