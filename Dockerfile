FROM oven/bun:1.2-alpine AS builder

RUN apk add --no-cache python3 make g++ gcc

WORKDIR /app

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run typecheck

FROM oven/bun:1.2-alpine AS production

RUN apk add --no-cache curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S elysia -u 1001 -G nodejs

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/drizzle ./drizzle

# Create data directory - the actual db file should come from volume mount
RUN mkdir -p /app/data && chown -R elysia:nodejs /app

USER elysia

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/app/data/sessions.db

EXPOSE 3001

# Volume for persistent data - mount this in your deployment platform
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health/live || exit 1

# Create db file if not exists, then migrate and start
CMD ["sh", "-c", "touch /app/data/sessions.db && bun run db:migrate && bun run src/index.ts"]
