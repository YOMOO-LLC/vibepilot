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

# Stage 2: Build signaling-server
FROM node:20-alpine AS signaling-builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml ./

# Copy protocol from previous stage
COPY --from=protocol-builder /app/packages/protocol ./packages/protocol

# Copy signaling-server
COPY signaling-server/package.json ./signaling-server/
COPY signaling-server/tsconfig.json ./signaling-server/
COPY signaling-server/src ./signaling-server/src

# Install dependencies and build
RUN pnpm install --frozen-lockfile --filter signaling-server
RUN pnpm --filter signaling-server build

# Stage 3: Production runtime
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml ./

# Copy built packages
COPY --from=signaling-builder /app/packages/protocol ./packages/protocol
COPY --from=signaling-builder /app/signaling-server ./signaling-server

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter signaling-server --prod

# Expose signaling server port
EXPOSE 9900

# Set default environment variables
ENV PORT=9900 \
    NODE_ENV=production

# Start signaling server
CMD ["node", "signaling-server/dist/index.js"]
