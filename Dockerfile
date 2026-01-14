# syntax=docker/dockerfile:1

# ============================================
# Build stage
# ============================================
FROM oven/bun:1.1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production=false

# Copy source
COPY . .

# Type check (optional, can be removed for faster builds)
RUN bun run typecheck

# ============================================
# Production stage
# ============================================
FROM oven/bun:1.1-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S elysia -u 1001 -G nodejs

WORKDIR /app

# Copy only production dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Set ownership
RUN chown -R elysia:nodejs /app

# Switch to non-root user
USER elysia

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:3001/api/health/live || exit 1

# Start application
CMD ["bun", "run", "src/index.ts"]
