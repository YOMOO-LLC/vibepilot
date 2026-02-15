# VibePilot

> Browser-based development environment with persistent terminal sessions, real-time file editing, and optional cloud remote access.

[![Tests](https://img.shields.io/badge/tests-635%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()
[![License](https://img.shields.io/badge/license-BSL%201.1-orange)]()
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)]()
[![pnpm](https://img.shields.io/badge/pnpm-9.15%2B-F69220)]()

VibePilot brings your terminal, file tree, and code editor to the browser. Run it locally for vibe coding, or deploy it remotely to access your development machine from anywhere.

**Key highlights:**

- **Session persistence** — Terminal sessions survive browser refreshes (configurable timeout)
- **WebRTC acceleration** — Sub-10ms terminal latency with automatic fallback to WebSocket
- **Monaco Editor** — Full-featured code editor with syntax highlighting for 100+ languages
- **Live file tree** — Real-time file system monitoring via chokidar
- **Browser preview** — Stream a headless Chrome instance via CDP screencast
- **Multi-project** — Switch between projects without restarting the agent
- **Interactive setup** — First-run wizard and `vibepilot config` for guided configuration
- **Cloud mode** — Optional Supabase authentication for secure remote access
- **PWA installable** — Install as a standalone desktop app

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Deployment Modes](#deployment-modes)
- [CLI Reference](#cli-reference)
- [Project Structure](#project-structure)
- [Features](#features)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Docker Deployment](#docker-deployment)
- [Tech Stack](#tech-stack)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)
- [Roadmap](#roadmap)

---

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Web)                              │
│                                                                     │
│  ┌────────────┐ ┌────────────┐ ┌────────────────┐ ┌─────────────┐  │
│  │  Terminal   │ │ File Tree  │ │  Monaco Editor  │ │  Preview    │  │
│  │ (xterm.js) │ │(Lazy-load) │ │(100+ languages) │ │(CDP stream) │  │
│  └──────┬─────┘ └──────┬─────┘ └───────┬────────┘ └──────┬──────┘  │
│         └──────────────┴───────────────┴─────────────────┘          │
│                       TransportManager                              │
│                 (WebRTC ⚡ + WebSocket 🔌)                          │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ authStore│ │agentStore│ │projectStr│ │terminalSt│ │browserStr│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ @vibepilot/protocol
                              │ (48 type-safe message types)
                              │
┌─────────────────────────────┴───────────────────────────────────────┐
│                         Agent (Node.js)                             │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐ │
│  │  PtyManager  │ │  FileWatcher │ │    WebRTC Peer + Signaling   │ │
│  │  (node-pty)  │ │  (chokidar)  │ │  (node-datachannel + Realtime)│ │
│  └──────────────┘ └──────────────┘ └──────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │   Session Persistence (OutputDelegate → CircularBuffer)      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐ │
│  │BrowserService│ │ AuthProvider │ │     ConfigManager            │ │
│  │  (CDP+Chrome)│ │ (pluggable)  │ │   (interactive setup)        │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────────┘ │
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐ │
│  │AgentRegistry │ │ProjectManager│ │     Setup Wizard             │ │
│  │ (pluggable)  │ │(multi-project│ │   (first-run config)         │ │
│  └──────────────┘ └──────────────┘ └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Connection Topology

VibePilot uses a **peer-to-peer architecture** where the browser connects directly to the Agent. The control plane (authentication, agent discovery) is separated from the data plane (terminal I/O, file transfers).

**Local & Cloud mode — Browser connects directly to Agent:**

```
┌──────────┐           WebRTC P2P (STUN)           ┌──────────┐
│          │◄═══════════════════════════════════════►│          │
│ Browser  │  Data: terminal-io, file-transfer      │  Agent   │
│          │                                        │          │
│          │◄──────── WebSocket (direct) ──────────►│          │
│          │  Signaling + fallback for all messages  │          │
└──────────┘                                        └──────────┘
```

**Connection upgrade flow (Local/Token mode):**

```
1. Browser opens WebSocket directly to Agent URL (e.g. wss://my-server:9800)
2. WebSocket is immediately usable for all message types
3. Browser initiates WebRTC upgrade in background:
   a. Creates RTCPeerConnection with STUN server (stun:stun.l.google.com:19302)
   b. Creates data channels: "terminal-io" (low-latency) + "file-transfer" (reliable)
   c. Exchanges SDP offer/answer and ICE candidates via the WebSocket
   d. STUN hole-punching establishes direct P2P connection
4. Once WebRTC connects, terminal I/O switches to P2P data channel (<10ms latency)
5. WebSocket remains open for signaling and non-realtime messages
6. If WebRTC fails, all traffic stays on WebSocket (graceful fallback)
```

**Cloud mode with Supabase Realtime signaling:**

In Cloud mode, WebRTC signaling uses Supabase Realtime instead of WebSocket for initial connection establishment:

```
1. User selects Agent from list → Browser gets Agent ID from Supabase registry
2. WebRTC signaling via Supabase Realtime broadcasts:
   a. Browser sends CONNECTION_REQUEST on presence channel (user:{userId}:agents)
   b. Agent responds with connection-ready
   c. Browser and Agent exchange SDP offer/answer on signaling channel (agent:{agentId}:signaling)
   d. ICE candidates exchanged via Supabase Realtime
   e. STUN hole-punching establishes direct P2P connection
3. Once WebRTC connects, terminal I/O flows over P2P data channels
4. If WebRTC fails, fallback to direct WebSocket connection (if Agent URL is accessible)
```

**Why Supabase Realtime for signaling?** In Cloud mode, the browser may not have direct WebSocket access to the Agent initially (behind NAT, dynamic IP). Supabase Realtime provides a reliable out-of-band signaling channel that both parties can reach, enabling WebRTC connection establishment even when direct connectivity isn't possible upfront.

### Data Channels

| Channel          | Mode                      | Purpose                                          | Latency           |
| ---------------- | ------------------------- | ------------------------------------------------ | ----------------- |
| `terminal-io`    | ordered, maxRetransmits=0 | Terminal input/output                            | <10ms (P2P)       |
| `file-transfer`  | ordered, reliable         | Image transfers, large files                     | Reliable delivery |
| `browser-stream` | ordered, reliable         | Browser screencast frames + input events         | Reliable delivery |
| WebSocket        | TCP                       | Signaling, file tree, editor, project management | ~30-50ms          |

**Key design decision**: Terminal I/O uses `maxRetransmits=0` (unreliable delivery) for minimum latency — a dropped keystroke or partial frame is preferable to head-of-line blocking. File transfers use reliable mode to guarantee data integrity.

### Bandwidth & Cost Architecture

All data flows directly between browser and Agent (P2P). **No traffic passes through any central server**, which means:

- Zero operational bandwidth cost for the cloud operator
- Latency depends only on the network path between user and Agent
- Scales to unlimited users without increasing server-side bandwidth

The only central infrastructure needed is for **control plane** operations:

- **Supabase** (or self-hosted DB): authentication, agent registry (tiny API calls)
- **STUN server**: helps peers discover public addresses (no data relay, ~200 bytes per session)

In the rare case where STUN hole-punching fails (symmetric NAT on both sides, ~15% of cases), a TURN relay would be needed. This is separate from VibePilot infrastructure and can use public TURN services or self-hosted `coturn`.

### Communication Flow

```
User Action → Zustand Store → transportManager.send()
  → WebRTC data channel (preferred) or WebSocket (fallback)
    → Agent WebSocketServer → dispatch → service handler
      → response message → wsClient.dispatch() → store update → React re-render
```

---

## Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm** 9.15+

### Install & Run

```bash
# Clone
git clone https://github.com/nicokimmel/vibepilot.git
cd vibepilot

# Install dependencies
pnpm install

# Build the protocol package (required before running agent/web)
pnpm --filter protocol build

# Terminal 1: Start the agent (backend)
pnpm --filter agent dev
# → Agent listening on ws://localhost:9800

# Terminal 2: Start the web app (frontend)
pnpm --filter web dev
# → Next.js on http://localhost:3000
```

Open http://localhost:3000 and you're ready to go:

1. A terminal tab opens automatically
2. Run commands (`ls`, `git status`, `npm install`, etc.)
3. **Refresh the page** — your terminal session restores automatically
4. Browse files in the left sidebar, click to open in the editor
5. Drag & drop images into the window to transfer them

### Using the Agent CLI

The agent CLI (`vibepilot`) can be run in development mode without a build step:

```bash
# Development mode — runs TypeScript directly via tsx
pnpm --filter agent dev                              # Starts "vibepilot serve"
npx tsx packages/agent/bin/vibepilot.ts setup         # First-run setup wizard
npx tsx packages/agent/bin/vibepilot.ts config        # Interactive configuration
npx tsx packages/agent/bin/vibepilot.ts project:list  # List projects
```

For production or global install:

```bash
# Build protocol + agent
pnpm --filter protocol build && pnpm --filter agent build

# Run compiled JS
node packages/agent/dist/bin/vibepilot.js serve

# Or link globally for use anywhere
cd packages/agent && pnpm link --global
vibepilot serve
```

---

## Deployment Modes

VibePilot supports three deployment modes, from zero-config local use to authenticated cloud access.

### 1. Local Mode (default)

No authentication. The agent and web app run on the same machine.

```bash
# Start agent
vibepilot serve --port 9800 --dir ~/projects

# Set in apps/web/.env.local
NEXT_PUBLIC_AUTH_MODE=none
```

### 2. Token Mode

Shared secret authentication. Suitable for a single user accessing their machine remotely.

```bash
# Start agent with a token
vibepilot serve --token my-secret-token --public-url wss://myserver.com:9800

# Set in apps/web/.env.local
NEXT_PUBLIC_AUTH_MODE=token
```

The web app shows a token input screen. Enter the same token to connect.

### 3. Supabase Cloud Mode

Full authentication with email/password, GitHub OAuth, and Google OAuth. Supports multiple users, each managing their own agents.

```bash
# Start agent with Supabase credentials
vibepilot serve \
  --supabase-url https://your-project.supabase.co \
  --supabase-key eyJ...your-service-role-key

# Set in apps/web/.env.local
NEXT_PUBLIC_AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
```

The web app shows a login screen with email/password and OAuth options. After login, users select from their registered agents.

**Cloud connection flow:**

```
1. User logs in → Supabase Auth (OAuth / email)
2. User selects Agent → triggers WebRTC connection via Supabase Realtime signaling
3. Browser ↔ Agent: WebRTC signaling via Supabase Realtime channels
   - CONNECTION_REQUEST/connection-ready on presence channel
   - SDP offer/answer + ICE candidates on ephemeral signaling channel
4. STUN hole-punching establishes direct P2P connection
5. All terminal/file traffic flows P2P between browser and Agent (<10ms latency)
6. Fallback: If WebRTC fails and Agent URL is accessible, direct WebSocket connection
```

Supabase handles authentication, agent registry, and **WebRTC signaling** (tiny broadcast messages). **No user data or terminal traffic passes through any central server** — it all flows P2P once the connection is established. The Agent does not need a public IP or open port if WebRTC succeeds via STUN.

**Setup steps:**

1. Create a [Supabase](https://supabase.com) project
2. Run the migration in `supabase/migrations/001_agents_table.sql` via the SQL editor
3. Enable desired OAuth providers in Supabase Dashboard > Authentication > Providers
4. Copy your project URL, anon key, and service role key to the environment variables

---

## CLI Reference

### `vibepilot serve`

Start the agent server.

| Option                            | Default                    | Description                                  |
| --------------------------------- | -------------------------- | -------------------------------------------- |
| `-p, --port <number>`             | `9800`                     | WebSocket server port                        |
| `-d, --dir <path>`                | Current directory          | Working directory for PTY sessions           |
| `-t, --session-timeout <seconds>` | `300`                      | PTY session timeout after disconnect         |
| `--token <token>`                 | —                          | Enable token authentication                  |
| `--agent-name <name>`             | Hostname                   | Display name in agent selector               |
| `--public-url <url>`              | —                          | Public WebSocket URL for registry            |
| `--registry-path <path>`          | `~/.vibepilot/agents.json` | File-based agent registry path               |
| `--supabase-url <url>`            | —                          | Supabase project URL (enables Supabase mode) |
| `--supabase-key <key>`            | —                          | Supabase service role key                    |

Environment variable equivalents: `VP_TOKEN`, `VP_AGENT_NAME`, `VP_PUBLIC_URL`, `VP_REGISTRY_PATH`, `VP_SUPABASE_URL`, `VP_SUPABASE_KEY`.

### `vibepilot setup`

First-run setup wizard. Guides you through authentication mode selection, optional cloud/device auth, and project directory configuration. Automatically runs on first `vibepilot serve` if no config file exists.

### `vibepilot config`

Interactive configuration menu. Displays current settings and provides sub-menus for:

| Sub-command       | Description                                        |
| ----------------- | -------------------------------------------------- |
| Authentication    | Switch auth mode (none, token, cloud, self-hosted) |
| Server Settings   | Port, agent name, session timeout, public URL      |
| Projects          | Add, remove, or list project directories           |
| View Full Config  | Print current `~/.vibepilot/config.json`           |
| Reset to Defaults | Reset all settings to factory defaults             |

### `vibepilot project:add <name> [path]`

Add a project to the agent's project list.

| Option              | Description                  |
| ------------------- | ---------------------------- |
| `-f, --favorite`    | Mark as favorite             |
| `-c, --color <hex>` | Color code (e.g., `#3b82f6`) |
| `-t, --tags <tags>` | Comma-separated tags         |

### `vibepilot project:list`

List all registered projects. Use `--json` for machine-readable output.

### `vibepilot project:remove <projectId>`

Remove a project by ID (first 8 characters are sufficient).

---

## Project Structure

```
vibepilot/
├── packages/
│   ├── protocol/                # @vibepilot/protocol — shared message types (zero deps)
│   │   ├── src/
│   │   │   ├── constants.ts     # 48 message type constants
│   │   │   ├── messages.ts      # Type-safe payload interfaces + createMessage()
│   │   │   └── types.ts         # VPMessage envelope type
│   │   └── __tests__/           # 31 tests
│   │
│   └── agent/                   # @vibepilot/agent — Node.js backend
│       ├── bin/vibepilot.ts     # CLI entry point (Commander.js)
│       ├── src/
│       │   ├── transport/       # WebSocketServer, WebRTCPeer, SignalingHandler
│       │   ├── pty/             # PtyManager, SessionPersistenceManager,
│       │   │                    # OutputDelegate, CircularBuffer
│       │   ├── fs/              # FileTreeService, FileContentService, FileWatcher
│       │   ├── browser/         # BrowserService, ScreencastStream, InputHandler,
│       │   │                    # AdaptiveQuality, ChromeDetector,
│       │   │                    # BrowserProfileManager, McpConfigManager, CursorProbe
│       │   ├── config/          # ConfigManager, ProjectManager, ProjectValidator
│       │   ├── cli/             # configCommand (interactive config),
│       │   │                    # setupWizard (first-run setup)
│       │   ├── auth/            # AuthProvider, TokenAuthProvider,
│       │   │                    # SupabaseAuthProvider, CredentialManager
│       │   ├── registry/        # AgentRegistry, FileSystemRegistry,
│       │   │                    # SupabaseRegistry
│       │   └── image/           # ImageReceiver
│       └── __tests__/           # 350+ tests
│
├── apps/
│   └── web/                     # @vibepilot/web — Next.js 15 frontend
│       ├── src/
│       │   ├── app/             # Next.js App Router pages
│       │   ├── components/
│       │   │   ├── terminal/    # TerminalInstance, TerminalSplitLayout
│       │   │   ├── editor/      # EditorPanel, MonacoEditor, ImagePreview
│       │   │   ├── browser/     # PreviewPanel, PreviewToolbar, PreviewPlaceholder
│       │   │   ├── filetree/    # FileTreePanel, FileTreeNode
│       │   │   ├── connection/  # ConnectionStatus, DevicePicker,
│       │   │   │                # TokenLoginScreen, SupabaseLoginScreen,
│       │   │   │                # AgentSelectorScreen
│       │   │   ├── project/     # ProjectSelectorModal, ProjectCard
│       │   │   ├── tabs/        # TabBar (unified terminal + editor + preview)
│       │   │   ├── layout/      # AppShell, Sidebar, StatusBar
│       │   │   └── image/       # ImageDropZone
│       │   ├── stores/          # 9 Zustand stores (incl. browserStore)
│       │   ├── hooks/           # useTerminal, useKeyboardShortcuts, usePWA
│       │   └── lib/             # websocket, webrtc, transport, portDetector
│       └── __tests__/           # 237 tests
│
├── relay-server/                # Message relay for NAT traversal (planned)
│                                # Routes VPMessages between browser and agent
│                                # when direct connection is not possible
│
├── signaling-server/            # Standalone WebRTC signaling relay
│
├── supabase/
│   └── migrations/              # SQL migrations for Supabase Cloud mode
│
├── docker-compose.yml           # Local deployment (agent + web + signaling)
├── docker-compose.cloud.yml     # Cloud overlay (+ Caddy HTTPS + Supabase env)
├── Caddyfile                    # Caddy reverse proxy config
└── .env.example                 # All environment variables documented
```

---

## Features

### Terminal

- **Multi-tab** — Create multiple terminal sessions, rename tabs, navigate with Ctrl+Tab
- **Split layouts** — Single, horizontal split, vertical split, or quad (4 terminals)
- **Session persistence** — On browser disconnect, PTY output is buffered in a circular buffer (100KB). On reconnect, buffered output replays automatically. Configurable timeout (default: 5 minutes).
- **CWD tracking** — Each terminal tracks its current working directory in real-time
- **Keyboard shortcuts** — Ctrl+Shift+T (new tab), Ctrl+Shift+W (close tab), Ctrl+Tab / Ctrl+Shift+Tab (switch tabs)

### Editor

- **Monaco Editor** — Powered by VS Code's editor engine with IntelliSense-ready API
- **100+ languages** — Automatic language detection from file extension
- **Dirty state tracking** — Visual indicator for unsaved changes
- **Image preview** — Open images directly in the editor panel
- **Save** — Ctrl+S / Cmd+S to write files back to the agent

### File Tree

- **Lazy loading** — Directories load on demand for performance
- **Real-time updates** — File system changes appear instantly via chokidar
- **Smart filtering** — Automatically hides `node_modules`, `.git`, `dist`, `.next`, `.turbo`, `coverage`, `.DS_Store`
- **Click to open** — Files open in the editor, seamlessly switching panes

### Image Transfer

- **Drag & drop** — Drop PNG, JPEG, GIF, WebP, or PDF files anywhere in the UI
- **Chunked transfer** — Large files are split into 63KB chunks for reliable delivery
- **Visual feedback** — Drop zone overlay indicates active drag state

### Browser Preview

- **Remote Chrome** — Launch a headless Chrome instance on the Agent via Chrome DevTools Protocol (CDP)
- **Screencast streaming** — Real-time browser frames sent over the `browser-stream` WebRTC data channel
- **Adaptive quality** — Frame quality adjusts dynamically based on network conditions and acknowledgement latency
- **Remote input** — Mouse clicks, keyboard input, and scrolling forwarded to the headless browser
- **Port detection** — Automatically detects dev server ports (e.g., `localhost:3000`) and suggests preview URLs
- **Cursor tracking** — Remote cursor CSS type streamed back to the browser for accurate pointer display
- **Idle timeout** — Chrome auto-stops after 10 minutes of inactivity to conserve resources
- **MCP integration** — Optionally installs MCP Chrome extension for AI-assisted browsing

### Interactive Configuration

- **First-run wizard** — `vibepilot setup` guides through auth mode, cloud login, and project directory setup
- **Interactive config** — `vibepilot config` provides menu-driven configuration for auth, server, and projects
- **Persistent config** — Settings stored in `~/.vibepilot/config.json`, no environment variables required
- **Device auth flow** — Cloud mode uses browser-based device authorization (similar to `gh auth login`)
- **Credential management** — Supabase tokens stored securely in the config file

### Transport Layer

- **P2P architecture** — Browser connects directly to Agent; no data passes through central servers
- **WebRTC preferred** — Automatic upgrade to WebRTC data channels via STUN hole-punching (`stun:stun.l.google.com:19302`)
- **Dual data channels** — `terminal-io` (ordered, unreliable for minimum latency) + `file-transfer` (ordered, reliable for data integrity)
- **WebSocket fallback** — Graceful degradation when WebRTC is unavailable; all message types work over WebSocket
- **Auto-reconnect** — 3-second reconnect delay on connection loss
- **Status indicators** — Real-time display of active transport (WS/WebRTC) in the status bar

### Project Management

- **Multi-project** — Register multiple projects, switch between them without restarting
- **Project metadata** — Name, path, favorite flag, color, and tags
- **Search & filter** — Find projects by name, path, or tags in the selector modal
- **Keyboard navigation** — Arrow keys and Enter in the project selector
- **Persistence** — Last selected project is restored on reconnect

### Authentication & Cloud

- **Three modes** — None (local), Token (shared secret), Supabase (OAuth + email)
- **Agent selector** — In auth mode, users can save and switch between multiple agents
- **Supabase OAuth** — GitHub and Google sign-in with one click
- **JWT verification** — Agent verifies Supabase JWTs via JWKS endpoint (no shared secrets)
- **Row Level Security** — Each user can only see and manage their own agents

### PWA

- **Installable** — Add to home screen / install as desktop app
- **Offline caching** — Service worker caches core assets for offline access
- **Standalone mode** — Runs in its own window without browser chrome

---

## Environment Variables

Copy `.env.example` to `.env` (or `apps/web/.env.local` for the web app) and configure:

### Web App (`NEXT_PUBLIC_*`)

| Variable                        | Default               | Description                               |
| ------------------------------- | --------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_WS_URL`            | `ws://localhost:9800` | Agent WebSocket URL                       |
| `NEXT_PUBLIC_SIGNALING_URL`     | `ws://localhost:9801` | WebRTC signaling server                   |
| `NEXT_PUBLIC_AUTH_MODE`         | `none`                | Auth mode: `none`, `token`, or `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL`      | —                     | Supabase project URL                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | —                     | Supabase anon/public key                  |

### Agent

| Variable           | Default                    | Description                          |
| ------------------ | -------------------------- | ------------------------------------ |
| `PORT`             | `9800`                     | WebSocket server port                |
| `SESSION_TIMEOUT`  | `300`                      | PTY timeout in seconds               |
| `VP_TOKEN`         | —                          | Auth token (enables token mode)      |
| `VP_AGENT_NAME`    | Hostname                   | Display name for agent registry      |
| `VP_PUBLIC_URL`    | —                          | Public WSS URL for agent             |
| `VP_REGISTRY_PATH` | `~/.vibepilot/agents.json` | File-based registry path             |
| `VP_SUPABASE_URL`  | —                          | Supabase URL (enables Supabase mode) |
| `VP_SUPABASE_KEY`  | —                          | Supabase service role key            |

---

## Testing

VibePilot uses [Vitest](https://vitest.dev/) with strict TDD methodology.

```bash
# Run all tests (619 tests across 66 files)
pnpm test

# Run tests for a specific package
pnpm --filter protocol test    # 31 tests
pnpm --filter agent test       # 343 tests
pnpm --filter web test         # 237 tests

# Run a single test file
pnpm --filter agent test -- --run __tests__/pty/PtyManager.test.ts

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# E2E tests (Playwright)
pnpm --filter web test:e2e
```

**Testing patterns:**

- **Protocol:** Pure unit tests for message creation and parsing
- **Agent:** Real filesystem (temp dirs), mocked `node-pty`, mocked `fetch` for Supabase
- **Web stores:** Mock `transportManager` with `vi.mock()`, `_trigger` helper for simulating messages
- **Web components:** Mock stores with `vi.mock('@/stores/...')`, `@testing-library/react`
- **Integration:** Random ports (19800+) to avoid conflicts, `connectClient`/`waitForMessage` helpers

---

## Docker Deployment

### Local (no auth)

```bash
docker compose up -d
```

This starts the agent (port 9800), signaling server (port 9900), and web app (port 3000).

### Cloud (with Supabase + HTTPS)

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials and domain

# 2. Start with cloud overlay
docker compose -f docker-compose.yml -f docker-compose.cloud.yml up -d
```

This adds Caddy for automatic HTTPS and injects Supabase environment variables.

### Production Build

```bash
# Build all packages
pnpm build

# Start agent
pnpm --filter agent start

# Start web (or deploy to Vercel/Netlify/Cloudflare Pages)
pnpm --filter web start
```

---

## Tech Stack

| Layer             | Technology                                         |
| ----------------- | -------------------------------------------------- |
| **Frontend**      | Next.js 15, React 19, TypeScript 5.7               |
| **Terminal**      | xterm.js, xterm-addon-fit                          |
| **Editor**        | Monaco Editor (@monaco-editor/react)               |
| **State**         | Zustand (9 stores)                                 |
| **Styling**       | Tailwind CSS 4                                     |
| **Layout**        | react-resizable-panels                             |
| **Backend**       | Node.js 20+, Commander.js                          |
| **PTY**           | node-pty                                           |
| **WebSocket**     | ws                                                 |
| **WebRTC**        | node-datachannel                                   |
| **Browser**       | Chrome DevTools Protocol (chrome-remote-interface) |
| **CLI prompts**   | @inquirer/prompts                                  |
| **File watching** | chokidar                                           |
| **Auth**          | jose (JWT/JWKS), @supabase/supabase-js             |
| **Protocol**      | @vibepilot/protocol (zero deps)                    |
| **Build**         | pnpm workspaces, Turborepo                         |
| **Testing**       | Vitest 3, @testing-library/react, Playwright       |
| **Linting**       | ESLint 9, Prettier 3                               |
| **CI/CD**         | husky, lint-staged                                 |
| **Deployment**    | Docker, Caddy 2                                    |

---

## Security

- **Path validation** — All file operations validated to stay within the workspace root (`FileContentService.validatePath()`)
- **Shell whitelist** — PTY sessions restricted to known safe shells (`/bin/bash`, `/bin/zsh`, `/bin/sh`)
- **Event debounce** — File watcher debounces rapid events (300ms) to prevent event storms
- **Message size limit** — WebSocket `maxPayload` set to 10MB to prevent memory exhaustion
- **Authentication** — Pluggable auth with timing-safe token comparison and JWKS JWT verification
- **Row Level Security** — Supabase RLS ensures user isolation at the database level
- **P2P data plane** — All terminal/file traffic flows directly between browser and Agent; no data passes through central servers
- **Transport encryption** — WebRTC uses DTLS; WebSocket should use WSS (TLS) in production
- **Session isolation** — Each PTY session is sandboxed to its workspace
- **Input validation** — Project paths checked against forbidden system directories
- **Browser URL validation** — Navigation restricted to `http:` and `https:` schemes only
- **Secure temp files** — Image and browser temp files use `mkdtemp` + `randomUUID` with `0o600` permissions
- **Auto HTTPS** — Caddy provides automatic TLS certificate management

For vulnerability reporting, see [SECURITY.md](SECURITY.md).

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development setup
- TDD workflow (Red → Green → Refactor)
- Code style conventions
- Commit message format (Conventional Commits)
- PR review process

```bash
# Quick dev setup
pnpm install
pnpm --filter protocol build
pnpm test  # Verify everything passes before making changes
```

---

## License

[Business Source License 1.1](LICENSE)

- **Free** for personal, educational, and non-commercial use
- **Commercial use** requires a license from YOMOO LLC
- **Converts to Apache 2.0** on the Change Date (2030-02-08)

---

## Roadmap

- [x] Terminal with session persistence
- [x] Monaco Editor with file system integration
- [x] WebRTC P2P acceleration (STUN hole-punching, dual data channels)
- [x] Multi-project management
- [x] Token authentication
- [x] Supabase Cloud mode (OAuth, agent registry, RLS)
- [x] Docker deployment with auto HTTPS
- [x] PWA support
- [ ] Port forwarding & web preview (preview dev servers through P2P tunnel)
- [x] Browser streaming (remote headless Chrome via CDP screencast + WebRTC data channel)
- [ ] Mobile simulator streaming (scrcpy/simctl via WebRTC)
- [ ] Intelligent notification system (command completion, error detection)
- [ ] AI agent activity monitor (Claude Code/OpenCode output parsing)
- [ ] Multi-user collaboration (shared terminals)
- [ ] File management (CRUD, Quick Open, global search)
- [ ] Relay server for NAT traversal (when direct P2P is not possible)
- [ ] Mobile responsive design

---

## Credits

Built with [xterm.js](https://xtermjs.org/), [Monaco Editor](https://microsoft.github.io/monaco-editor/), [node-pty](https://github.com/microsoft/node-pty), [node-datachannel](https://github.com/murat-aspect/node-datachannel), [Supabase](https://supabase.com), and [Caddy](https://caddyserver.com).

---

&copy; 2024-2026 YOMOO LLC. All rights reserved.
