FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

COPY package.json bun.lockb* ./

RUN bun install --frozen-lockfile --production=false

COPY . .

RUN bun run typecheck

FROM oven/bun:1.1-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S elysia -u 1001 -G nodejs

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/drizzle.config.ts ./

RUN mkdir -p /app/data && chown -R elysia:nodejs /app

USER elysia

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health/live || exit 1

CMD ["bun", "run", "src/index.ts"]
