# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. For full architecture, deployment modes, and feature documentation, see [README.md](README.md).

## Build & Test Commands

```bash
# Monorepo-wide (via Turbo)
pnpm build              # Build all packages (respects dependency order)
pnpm test               # Run all tests
pnpm lint               # Lint all packages
pnpm dev                # Start all dev servers

# Single package
pnpm --filter protocol build        # Build protocol (must run before agent/web)
pnpm --filter agent build
pnpm --filter web build

# Run tests for a specific package
pnpm --filter protocol test
pnpm --filter agent test
pnpm --filter web test

# Run a single test file
pnpm --filter agent test -- --run __tests__/fs/FileContentService.test.ts
pnpm --filter web test -- --run __tests__/stores/editorStore.test.ts

# Dev servers (run in separate terminals)
pnpm --filter agent dev             # Agent on ws://localhost:9800
pnpm --filter web dev               # Web on http://localhost:3000

# E2E tests
pnpm --filter web test:e2e
```

**Important**: After modifying `packages/protocol`, rebuild it (`pnpm --filter protocol build`) before running agent or web, since they import from the compiled output.

## Monorepo Layout

```
packages/protocol/   → @vibepilot/protocol  (shared message types, zero deps)
packages/agent/      → @vibepilot/agent     (Node.js backend: PTY, FS, Browser, WebSocket, WebRTC)
apps/web/            → @vibepilot/web       (Next.js 15 frontend: terminal, editor, browser preview, file tree)
relay-server/        → message relay for NAT traversal (planned, not yet integrated)
signaling-server/    → standalone WebRTC signaling relay
```

## Protocol (`@vibepilot/protocol`)

- Message envelope: `VPMessage<T, P>` with `type`, `id`, `timestamp`, `payload`
- `MessagePayloadMap` provides compile-time type safety for `createMessage(type, payload)`
- Categories: Terminal (10), FileTree (3), FileContent (5), Image (4), Signal (3), Project (11), Browser (12) — 48 total

## Agent Services (`packages/agent/src/`)

| Service                   | Location     | Purpose                                             |
| ------------------------- | ------------ | --------------------------------------------------- |
| WebSocketServer           | `transport/` | Central message router, per-client `ClientState`    |
| WebRTCPeer                | `transport/` | P2P data channels via `node-datachannel`            |
| PtyManager                | `pty/`       | `node-pty` sessions, CWD polling                    |
| SessionPersistenceManager | `pty/`       | Orphan/reclaim lifecycle, `CircularBuffer` replay   |
| FileTreeService           | `fs/`        | Directory listing, ignore patterns                  |
| FileContentService        | `fs/`        | File read/write, extension→language mapping         |
| FileWatcher               | `fs/`        | chokidar-based change broadcast                     |
| BrowserService            | `browser/`   | Headless Chrome via CDP, screencast streaming       |
| ConfigManager             | `config/`    | Persistent JSON config (`~/.vibepilot/config.json`) |
| AuthProvider              | `auth/`      | Pluggable: TokenAuthProvider, SupabaseAuthProvider  |
| AgentRegistry             | `registry/`  | Pluggable: FileSystemRegistry, SupabaseRegistry     |
| ProjectManager            | `config/`    | Multi-project management + path validation          |

## Web Stores (`apps/web/src/stores/`)

| Store             | Key responsibility                           |
| ----------------- | -------------------------------------------- |
| `connectionStore` | WebSocket/WebRTC connection lifecycle        |
| `terminalStore`   | Terminal tabs, session IDs, CWD map          |
| `editorStore`     | Editor tabs, file content, dirty tracking    |
| `workspaceStore`  | Active pane type (terminal/editor/preview)   |
| `browserStore`    | Browser preview state, frames, input events  |
| `fileTreeStore`   | Lazy-loaded directory tree, expand state     |
| `projectStore`    | Multi-project switching                      |
| `authStore`       | Auth state (token/Supabase), session restore |
| `agentStore`      | Agent list, agent selection (Cloud mode)     |

## Key Patterns

**Transport**: Browser connects directly to Agent (P2P, no relay). WebSocket connects first, WebRTC upgrades in background via STUN. Three data channels: `terminal-io` (low-latency, unreliable), `file-transfer` (reliable), and `browser-stream` (reliable, screencast frames + input). See [README.md#connection-topology](README.md#connection-topology) for full topology diagram.

**Message flow**:

```
Store → transportManager.send(type, payload)
  → WebRTC data channel (terminal/image) or WebSocket (everything else)
    → Agent WebSocketServer → switch(msg.type) → service handler
      → response → store listener → React re-render
```

**Store listeners**: Stores register message handlers inside `create()` callbacks (see `fileTreeStore`, `editorStore` for pattern).

**UI preservation**: Terminal ↔ Editor ↔ Preview switching uses `display:none` (not unmount) to preserve xterm state.

**Singletons**: Use `Symbol.for()` on `globalThis` to survive Turbopack module duplication.

## Development Methodology

**All new features must follow TDD** (Red → Green → Refactor):

1. Create test in `__tests__/` directory, run to confirm it fails
2. Write minimum implementation to pass
3. Run full suite (`pnpm test`) for regressions
4. Iterate one test at a time — do NOT write all tests at once

## Testing Patterns

- **Framework**: Vitest 3 with globals enabled
- **Web environment**: jsdom + `@testing-library/react`
- **Agent tests**: Real filesystem (temp dirs), mocked `node-pty`
- **Store tests**: `vi.mock('@/lib/transport')` → `send` spy + `_trigger` helper for incoming messages
- **Component tests**: `vi.mock('@/stores/...')` for isolation
- **Integration tests**: Random ports (`19800 + Math.random() * 1000`), `connectClient`/`waitForMessage` helpers

## Conventions

- Protocol version: `0.1.0`, default port: `9800`
- Message IDs: `${Date.now()}-${counter}`
- Tab IDs: `tab-${Date.now()}-${counter}` (terminal), `editor-${Date.now()}-${counter}` (editor)
- Path safety: FileTreeService validates paths within rootPath
- Ignored dirs: `node_modules`, `.git`, `dist`, `.next`, `.turbo`, `coverage`, `.DS_Store`
