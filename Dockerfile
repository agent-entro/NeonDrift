# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/

# Install deps (all workspaces)
RUN npm ci

# Copy source
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Build shared first, then server
RUN npm run build -w packages/shared
RUN npm run build -w packages/server

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Production deps only
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY packages/server/src/migrations ./packages/server/dist/migrations

# SQLite data directory (mount as volume in prod)
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/neondrift.db

EXPOSE 3001

CMD ["node", "packages/server/dist/main.js"]
