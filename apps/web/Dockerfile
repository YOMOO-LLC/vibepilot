# Stage 1: Build protocol package
FROM node:20-alpine AS protocol-builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml ./

# Copy protocol package
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/protocol/tsconfig.json ./packages/protocol/
COPY packages/protocol/src ./packages/protocol/src

# Install dependencies and build protocol
RUN pnpm install --frozen-lockfile --filter protocol
RUN pnpm --filter protocol build

# Stage 2: Build web app
FROM node:20-alpine AS web-builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml ./

# Copy protocol from previous stage
COPY --from=protocol-builder /app/packages/protocol ./packages/protocol

# Copy web app
COPY apps/web/package.json ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/
COPY apps/web/next.config.ts ./apps/web/
COPY apps/web/tailwind.config.ts ./apps/web/
COPY apps/web/postcss.config.mjs ./apps/web/
COPY apps/web/public ./apps/web/public
COPY apps/web/src ./apps/web/src

# Install dependencies and build
RUN pnpm install --frozen-lockfile --filter web
RUN pnpm --filter web build

# Stage 3: Production runtime
FROM node:20-alpine

WORKDIR /app

# Copy only necessary files for Next.js standalone
COPY --from=web-builder /app/apps/web/.next/standalone ./
COPY --from=web-builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-builder /app/apps/web/public ./apps/web/public

# Expose Next.js port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Start Next.js server
CMD ["node", "apps/web/server.js"]
