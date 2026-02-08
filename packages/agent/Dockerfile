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

# Stage 2: Build agent
FROM node:20-alpine AS agent-builder

# Install build dependencies for native modules (node-pty, node-datachannel)
RUN apk add --no-cache python3 make g++ linux-headers

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml ./

# Copy protocol from previous stage
COPY --from=protocol-builder /app/packages/protocol ./packages/protocol

# Copy agent package
COPY packages/agent/package.json ./packages/agent/
COPY packages/agent/tsconfig.json ./packages/agent/
COPY packages/agent/src ./packages/agent/src
COPY packages/agent/bin ./packages/agent/bin

# Install dependencies and build agent
RUN pnpm install --frozen-lockfile --filter agent
RUN pnpm --filter agent build

# Stage 3: Production runtime
FROM node:20-alpine

# Install runtime dependencies for node-pty
RUN apk add --no-cache bash git

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml ./

# Copy built packages
COPY --from=agent-builder /app/packages/protocol ./packages/protocol
COPY --from=agent-builder /app/packages/agent ./packages/agent

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter agent --prod

# Expose WebSocket port
EXPOSE 9800

# Set default environment variables
ENV PORT=9800 \
    NODE_ENV=production

# Start agent
CMD ["node", "packages/agent/dist/bin/vibepilot.js", "serve", "--host", "0.0.0.0"]
