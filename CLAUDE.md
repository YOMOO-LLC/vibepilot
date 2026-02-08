# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Architecture

### Monorepo Layout

```
packages/protocol/   → @vibepilot/protocol  (shared message types, zero deps)
packages/agent/      → @vibepilot/agent     (Node.js backend: PTY, FS, WebSocket, WebRTC)
apps/web/            → @vibepilot/web       (Next.js 15 frontend: terminal, editor, file tree)
signaling-server/    → standalone WebRTC signaling relay
```

### Protocol (`@vibepilot/protocol`)

Defines the message envelope (`VPMessage<T, P>`) and all message types. Every message has `type`, `id`, `timestamp`, `payload`. The `MessagePayloadMap` provides compile-time type safety for message creation.

Message categories: Terminal (8), FileTree (3), FileContent (5), Image (4), WebRTC Signal (3), Project (4).

Key helper: `createMessage(type, payload)` — type-safe message factory with auto-generated IDs.

### Agent (Backend)

CLI entry: `packages/agent/bin/vibepilot.ts` → spawns `VPWebSocketServer` on port 9800.

**WebSocketServer** is the central message router. It receives `VPMessage`, dispatches to handlers via `switch(msg.type)`, and manages per-client state (`ClientState`).

Services:
- **PtyManager** — spawns/manages `node-pty` sessions, tracks CWD via polling
- **FileTreeService** — recursive directory listing with ignored paths (node_modules, .git, dist, .next, .turbo, coverage)
- **FileContentService** — reads files (text as utf-8, images as base64), writes files, maps extensions to Monaco language IDs
- **FileWatcher** — chokidar-based file change monitoring, broadcasts to all clients
- **SignalingHandler/WebRTCPeer** — WebRTC negotiation via `node-datachannel`

### Web (Frontend)

Next.js 15 with Turbopack, React 19, Tailwind CSS 4.

**State** — Zustand stores (5 stores):
- `connectionStore` — WebSocket/WebRTC connection lifecycle
- `terminalStore` — terminal tabs, session IDs, CWD map
- `editorStore` — editor tabs, file content, dirty tracking
- `workspaceStore` — active pane type (terminal vs editor)
- `fileTreeStore` — lazy-loaded directory tree, expand state

**Transport layer** (`lib/transport.ts`):
- `TransportManager` singleton prefers WebRTC for terminal I/O and file transfers, falls back to WebSocket
- `wsClient` (`lib/websocket.ts`) handles message dispatch by type
- Stores register message listeners inside `create()` callbacks (important pattern — see fileTreeStore/editorStore)

**Key UI patterns**:
- Terminal ↔ Editor switching uses `display:none` to preserve xterm state (not unmount)
- `TabBar` merges terminal and editor tabs into unified tab strip
- File tree click → `editorStore.openFile()` → sends `file:read` → agent responds with `file:data`

### Communication Flow

```
Frontend Store → transportManager.send(type, payload)
  → WebSocket (or WebRTC for terminal/image data)
    → Agent WebSocketServer.handleMessage → switch(type) → handler
      → handler calls service → creates response → ws.send()
        → wsClient.dispatch(msg) → store listener updates state → React re-renders
```

## Development Methodology

**All new features must follow Test-Driven Development (TDD)**:

1. **Red** — Write a failing test first that defines the expected behavior
2. **Green** — Write the minimum implementation code to make the test pass
3. **Refactor** — Clean up the code while keeping tests green

**TDD workflow for this project**:
- Before writing any implementation code, create the test file in the corresponding `__tests__/` directory
- Run `pnpm --filter <package> test -- --run __tests__/<path>.test.ts` to confirm the test fails
- Implement the feature until the test passes
- Run the full test suite (`pnpm test`) to ensure no regressions
- Only then proceed to the next feature or test case

**Do NOT**:
- Write implementation code without a corresponding test
- Skip the "red" phase — if the test passes before implementation, the test is not testing the right thing
- Write all tests at once — iterate one test case at a time

## Testing Patterns

- **Framework**: Vitest 3 with globals enabled
- **Web environment**: jsdom with `@testing-library/react`
- **Agent tests**: Real filesystem (temp dirs), mocked `node-pty`
- **Store tests**: Mock `transportManager` with `vi.mock('@/lib/transport')` pattern — provides `send` spy and `_trigger` helper to simulate incoming messages
- **Component tests**: Mock stores with `vi.mock('@/stores/...')` when testing in isolation
- **Agent integration tests**: Random ports (`19800 + Math.random() * 1000`) to avoid conflicts, `connectClient`/`waitForMessage` helpers

## Key Conventions

- Protocol version: `0.1.0`, default port: `9800`
- Message IDs: `${Date.now()}-${counter}`
- Tab IDs: `tab-${Date.now()}-${counter}` (terminal), `editor-${Date.now()}-${counter}` (editor)
- Path safety: FileTreeService validates paths are within rootPath
- Ignored dirs: `node_modules`, `.git`, `dist`, `.next`, `.turbo`, `coverage`, `.DS_Store`
- Singletons use `Symbol.for()` on `globalThis` to survive Turbopack module duplication
