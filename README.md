# VibePilot

> Browser-based terminal and file manager with persistent sessions and WebRTC acceleration

[![Tests](https://img.shields.io/badge/tests-294%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()
[![License](https://img.shields.io/badge/license-BSL%201.1-orange)]()

VibePilot is a modern web-based development environment that brings your terminal and file system to the browser with production-grade features:

- **🔄 Session Persistence** — Terminal sessions survive browser refreshes (5min timeout)
- **⚡ WebRTC Acceleration** — Low-latency terminal I/O and file transfers
- **📂 Live File Tree** — Real-time file system monitoring with Monaco Editor
- **🔌 PTY Sessions** — Full-featured terminal emulation with xterm.js
- **🎯 Type-Safe Protocol** — Zero-dependency message protocol with compile-time safety

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (Web)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Terminal   │  │  File Tree   │  │    Editor    │  │
│  │  (xterm.js)  │  │   (Lazy)     │  │   (Monaco)   │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └──────────────────┴──────────────────┘          │
│                   TransportManager                       │
│              (WebRTC ⚡ + WebSocket 🔌)                  │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │ @vibepilot/protocol
                           │ (Type-safe messages)
                           │
┌──────────────────────────┴──────────────────────────────┐
│                    Agent (Node.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  PtyManager  │  │  FileWatcher │  │  WebRTC Peer │  │
│  │  (node-pty)  │  │  (chokidar)  │  │(node-dc + WS)│  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│         Session Persistence (orphan + timeout)          │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9.15+

### Installation

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/vibepilot.git
cd vibepilot

# Install dependencies
pnpm install

# Build protocol (required first)
pnpm --filter protocol build
```

### Development

```bash
# Terminal 1: Start agent (backend)
pnpm --filter agent dev
# → Agent listening on ws://localhost:9800

# Terminal 2: Start web (frontend)
pnpm --filter web dev
# → Next.js on http://localhost:3000
```

Open http://localhost:3000 — your terminal is ready! Try:
1. Click "New Terminal" button
2. Run commands (e.g., `ls`, `git status`)
3. **Refresh the page** → terminal session automatically restores
4. Browse files in left sidebar → click to open in Monaco editor

### Production Build

```bash
# Build all packages
pnpm build

# Run agent
pnpm --filter agent start

# Run web (or deploy to Vercel/Netlify)
pnpm --filter web start
```

### CLI Options

```bash
# Agent server
vibepilot serve \
  --port 9800 \
  --dir /path/to/workspace \
  --session-timeout 300  # seconds (default: 5 minutes)
```

## Project Structure

```
vibepilot/
├── packages/
│   ├── protocol/          # @vibepilot/protocol
│   │   ├── src/
│   │   │   ├── constants.ts   # Message types (29 types)
│   │   │   ├── messages.ts    # Type-safe payload definitions
│   │   │   └── types.ts       # Shared types
│   │   └── __tests__/         # 25 tests
│   │
│   └── agent/             # @vibepilot/agent
│       ├── bin/
│       │   └── vibepilot.ts   # CLI entry
│       ├── src/
│       │   ├── pty/           # PTY session management
│       │   │   ├── PtyManager.ts
│       │   │   ├── SessionPersistenceManager.ts
│       │   │   ├── OutputDelegate.ts  # Switchable output sink
│       │   │   └── CircularBuffer.ts  # Output buffering
│       │   ├── transport/     # WebSocket + WebRTC
│       │   ├── fs/            # File system services
│       │   ├── config/        # Project management
│       │   └── image/         # Image transfer
│       └── __tests__/         # 117 tests
│
├── apps/
│   └── web/               # @vibepilot/web
│       ├── src/
│       │   ├── app/           # Next.js 15 app router
│       │   ├── components/    # React components
│       │   ├── stores/        # Zustand state (5 stores)
│       │   ├── hooks/         # Custom hooks
│       │   └── lib/           # Transport layer
│       └── __tests__/         # 152 tests
│
└── signaling-server/      # WebRTC signaling relay
    ├── src/
    │   └── index.ts       # Standalone WebSocket server
    └── __tests__/
```

## Key Features

### 1. Session Persistence

Terminals survive browser disconnects:
- **On disconnect:** PTY detaches output → buffered for 5 minutes
- **On reconnect:** Frontend sends `terminal:attach` → buffered output replayed
- **Timeout:** After 5 min, PTY automatically destroyed

Implementation: `SessionPersistenceManager` + `OutputDelegate` pattern.

### 2. Transport Layer

```typescript
// Automatic WebRTC upgrade for performance
transportManager.send(MessageType.TERMINAL_INPUT, {
  sessionId,
  data: 'ls\r'
});
// → WebRTC data channel (if connected)
// → Falls back to WebSocket
```

- **WebSocket:** Control plane + fallback
- **WebRTC:** High-throughput terminal I/O and file transfers
- Automatic negotiation via signaling server

### 3. Type-Safe Protocol

```typescript
// Compile-time type checking
const msg = createMessage(MessageType.TERMINAL_CREATED, {
  sessionId: 'sess-1',
  pid: 12345,
  // ❌ TypeScript error if fields missing/wrong type
});
```

Zero runtime dependencies. Message ID generation: `${Date.now()}-${counter}`.

### 4. File System Integration

- **Real-time monitoring:** Chokidar watches workspace
- **Lazy loading:** File tree loads on-demand (depth-first)
- **Ignored patterns:** `node_modules`, `.git`, `dist`, `.next`, `.turbo`, `coverage`
- **Monaco Editor:** Syntax highlighting for 100+ languages

## Testing

```bash
# Run all tests (294 tests)
pnpm test

# Package-specific
pnpm --filter protocol test  # 25 tests
pnpm --filter agent test     # 117 tests
pnpm --filter web test       # 152 tests

# Watch mode
pnpm test:watch

# E2E tests (Playwright)
pnpm --filter web test:e2e
```

Coverage: Protocol (100%), Agent (85%), Web (78%).

## Environment Variables

Create `.env.local` in `apps/web/`:

```bash
# WebSocket URL (default: ws://localhost:9800)
NEXT_PUBLIC_WS_URL=ws://your-agent-server:9800

# Signaling server (for WebRTC, optional)
NEXT_PUBLIC_SIGNALING_URL=ws://your-signaling:9801
```

Agent environment:
```bash
# Port (default: 9800)
PORT=9800

# Session timeout in seconds (default: 300)
SESSION_TIMEOUT=300
```

## Tech Stack

**Frontend:**
- Next.js 15 (React 19, App Router, Turbopack)
- xterm.js (terminal emulation)
- Monaco Editor (code editing)
- Zustand (state management)
- Tailwind CSS 4

**Backend:**
- Node.js 20+
- node-pty (PTY sessions)
- ws (WebSocket server)
- node-datachannel (WebRTC)
- chokidar (file watching)

**Tooling:**
- pnpm workspaces + Turbo (monorepo)
- TypeScript 5.7 (strict mode)
- Vitest 3 (testing)
- Playwright (E2E)

## Performance

- **Startup:** < 1s (Turbopack dev mode)
- **Terminal latency:** < 10ms (WebRTC)
- **File tree:** Lazy loaded (< 100ms per depth level)
- **Build size:** 104 KB First Load JS (web)

## Browser Support

- Chrome/Edge 90+ (WebRTC required)
- Firefox 88+
- Safari 15+

Mobile browsers not officially supported (desktop-focused UI).

## Security

- **Path validation:** FileTreeService checks all paths are within workspace
- **No shell injection:** Commander.js handles CLI args safely
- **WebRTC encryption:** DTLS/SRTP by default
- **Session isolation:** Each terminal session is sandboxed

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR process.

## License

Business Source License 1.1 — See [LICENSE](LICENSE)

**TL;DR:** Free for personal/non-commercial use. Commercial use requires a license. Converts to Apache 2.0 after Change Date.

## Roadmap

- [ ] Multi-user collaboration (shared terminals)
- [ ] SSH remote connection support
- [ ] Plugin system for custom commands
- [ ] Vim mode for terminal
- [ ] Mobile responsive design
- [ ] Docker container distribution

## Credits

Built with:
- [xterm.js](https://xtermjs.org/) — Terminal emulation
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — Code editing
- [node-pty](https://github.com/microsoft/node-pty) — PTY bindings
- [node-datachannel](https://github.com/paullouisageneau/libdatachannel) — WebRTC

## Support

- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/vibepilot/issues)
- **Discussions:** [GitHub Discussions](https://github.com/YOUR_USERNAME/vibepilot/discussions)
- **Security:** See [SECURITY.md](SECURITY.md)

---

Made with ⚡ by [Your Name]
