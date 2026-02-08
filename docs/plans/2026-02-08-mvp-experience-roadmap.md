# VibePilot MVP Experience Roadmap

> Target: Transform VibePilot from a functional MVP into a polished remote development environment with intelligent notifications, AI agent monitoring, and collaborative terminal sessions.

## Current State

VibePilot MVP provides:
- Multi-tab terminal management with 4 layout modes (xterm.js + node-pty)
- Monaco editor with 30+ language support and dirty tracking
- Lazy-loaded file tree with VS Code icons and real-time change notifications
- Drag-and-drop / paste image upload with chunked base64 transfer
- Dual transport (WebSocket + WebRTC) with automatic upgrade
- Project switching and CWD-following file tree

**Core architecture strengths**: type-safe protocol (`VPMessage`), Zustand stores, `TransportManager` singleton, `OutputDelegate` pattern for PTY output routing.

## Problem Analysis

As a remote development environment, VibePilot has gaps in four layers:

| Layer | Gap | Impact |
|-------|-----|--------|
| Connection | Page refresh kills sessions, no auto-reconnect | Data loss, workflow interruption |
| Perception | No notifications for background tasks, users are "blind" when away | Missed build failures, wasted time waiting |
| Collaboration | Single-user model, no session sharing | Can't pair debug or show AI progress to others |
| Interaction | No file CRUD, no Quick Open, no global search | Basic operations require terminal commands |

---

## Milestone 0: Connection Resilience (In Progress)

> **Status**: Phase 1-2 complete, Phase 3-8 pending
> **Dependency**: Foundation for all subsequent milestones

### Summary

PTY sessions survive browser refresh/disconnect. Buffered output replays on reconnect. Timeout auto-destroys orphaned sessions.

### Architecture

```
TERMINAL_CREATE → PTY running, output forwarded to client
  ↓ (WS disconnect)
orphan(sessionId) → detach output → start timeout → buffer to CircularBuffer
  ↓ (client reconnects)
TERMINAL_ATTACH → reclaim → attach(newSink) → replay buffer → resume
  or
  ↓ (timeout expires, default 5min)
expire → ptyManager.destroy() → session destroyed
```

### Components

| Component | Status | Purpose |
|-----------|--------|---------|
| CircularBuffer | Done | Fixed-capacity (100KB) ring buffer for PTY output |
| OutputDelegate | Done | Permanent `onData` handler with swappable sink |
| Protocol: TERMINAL_ATTACH/ATTACHED | Done | New message types for session reattachment |
| SessionPersistenceManager | Pending | Orphan/reclaim lifecycle with timeout cleanup |
| PtyManager refactor | Pending | Integrate OutputDelegate, add detach/attach methods |
| WebSocketServer integration | Pending | orphan on disconnect, handleTerminalAttach |
| Frontend sessionStorage | Pending | Persist tabs with `needsAttach` flag |
| WebSocket auto-reconnect | Pending | 3-second delay reconnect on `onclose` |

### Detailed Plan

See: `.claude/plans/toasty-yawning-honey.md`

---

## Milestone 1: Intelligent Notification System

> **Dependency**: Milestone 0 (stable connection required)
> **Value**: Highest ROI — users no longer need to stare at terminals

### Problem

When running long tasks (`npm build`, `pytest`, `claude-code`), users have no way to know when they complete unless actively watching the terminal. This is especially painful in a remote dev scenario where the browser tab may be in the background.

### Architecture

```
PTY output stream
  → TerminalEventDetector (agent-side, async)
    → pattern match: prompt return, error keywords, exit code
      → EventBus.emit('terminal:event', { type, sessionId, detail })
        → WebSocket → terminal:event message
          → notificationStore
            → Browser Notification API (background)
            → Toast UI (foreground)
            → Tab title badge
            → Terminal tab status indicator
```

### Event Detection (TerminalEventDetector)

Runs on the agent side to avoid frontend performance impact. Pattern-based detection:

| Event | Detection Strategy | Example |
|-------|-------------------|---------|
| Command complete | New shell prompt detected (`$`, `❯`, `>`, `%`) after output | `npm build` finishes, prompt returns |
| Process exit | PTY `onExit` event with exit code | Long-running script ends |
| Error output | Keywords: `error`, `FAILED`, `ERR!`, `FATAL`, `panic` | Build failure, test crash |
| Test results | Regex for test framework output patterns | `42 passed, 2 failed` |

Detection is conservative — better to miss an event than send false positives.

### Protocol Extension

```typescript
// New message types
TERMINAL_EVENT: 'terminal:event'

// Payload
interface TerminalEventPayload {
  sessionId: string;
  eventType: 'command_complete' | 'process_exit' | 'error' | 'test_result';
  summary: string;        // Human-readable: "Build completed successfully"
  exitCode?: number;
  timestamp: number;
}
```

### Frontend: notificationStore

```typescript
interface Notification {
  id: string;
  sessionId: string;
  eventType: string;
  summary: string;
  timestamp: number;
  read: boolean;
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  browserPermission: 'default' | 'granted' | 'denied';

  addNotification(n: Notification): void;
  markRead(id: string): void;
  markAllRead(): void;
  requestBrowserPermission(): void;
  clear(): void;
}
```

### Frontend UI Components

**Browser Push Notification**: When page is not focused, show system notification via `Notification` API. Click navigates to the relevant terminal tab.

**Tab Title Badge**: `(3) VibePilot` shows unread event count. Clears when user views the terminal.

**Toast Notification**: In-app toast (top-right), auto-dismiss after 5s. Click jumps to terminal. Color-coded: green (success), red (error), blue (info).

**Terminal Tab Status Indicator**: Small colored dot on terminal tab label:
- `🟢` idle (prompt visible)
- `🟡` running (command executing)
- `🔴` error (last command failed)

### Configuration

User preferences stored in `localStorage`:
```typescript
interface NotificationPreferences {
  enableBrowser: boolean;       // default: true
  enableToast: boolean;         // default: true
  enableTabBadge: boolean;      // default: true
  events: {
    command_complete: boolean;   // default: true
    process_exit: boolean;      // default: true
    error: boolean;             // default: true
    test_result: boolean;       // default: true
  };
}
```

### Files to Create/Modify

| File | Change |
|------|--------|
| `packages/agent/src/pty/TerminalEventDetector.ts` | New: event detection engine |
| `packages/agent/__tests__/pty/TerminalEventDetector.test.ts` | New: tests |
| `packages/protocol/src/constants.ts` | +1 MessageType |
| `packages/protocol/src/messages.ts` | +1 payload interface |
| `packages/agent/src/transport/WebSocketServer.ts` | Wire detector to PTY output |
| `apps/web/src/stores/notificationStore.ts` | New: notification state |
| `apps/web/src/components/notifications/Toast.tsx` | New: toast component |
| `apps/web/src/components/notifications/NotificationBell.tsx` | New: header bell icon |
| `apps/web/src/components/terminal/TerminalTabStatus.tsx` | New: status indicator |

---

## Milestone 2: AI Agent Activity Monitor

> **Dependency**: Milestone 1 (reuses event bus and notification infrastructure)
> **Value**: Differentiating feature — see what AI agents are doing in real-time

### Problem

When Claude Code, OpenCode, or other AI agents run in a terminal, their output is a raw character stream. Users can't quickly see: what files were modified, what actions were taken, or when the agent is done thinking.

### Architecture: Pluggable Parser System

```
Terminal output → AgentDetectorRegistry
  ├─ ClaudeCodeParser   — detects ⏺ markers, tool use patterns
  ├─ OpenCodeParser     — detects OpenCode output patterns
  └─ GenericCLIParser   — fallback: prompt return, exit codes
```

**Detection flow**:
1. When a terminal session starts, output is buffered for first ~500 bytes
2. Each registered parser's `detect(buffer): boolean` is called
3. First matching parser is activated for that session
4. If none match, GenericCLIParser is used as fallback
5. Parser can be manually overridden per terminal in settings

### Parser Interface

```typescript
interface AgentParser {
  readonly name: string;          // 'claude-code', 'opencode', 'generic'
  readonly displayName: string;   // 'Claude Code', 'OpenCode', 'CLI'

  detect(initialOutput: string): boolean;
  parse(chunk: string): AgentEvent[];
  reset(): void;
}

interface AgentEvent {
  type: 'tool_use' | 'file_read' | 'file_write' | 'thinking' | 'error' | 'complete' | 'idle';
  agent: string;
  detail: string;        // Human-readable: "Editing src/utils.ts"
  files?: string[];
  timestamp: number;
}
```

### ClaudeCodeParser

Detects by: presence of `⏺` character in output within first 500 bytes.

Parses:
- `⏺` followed by text → new action step
- `Read(filepath)` / `Edit(filepath)` / `Write(filepath)` → file operations
- `Bash(command)` → shell command execution
- Thinking indicators (streaming dots, etc.) → thinking state
- Cost/token summary at end → session complete

### OpenCodeParser

Detects by: OpenCode-specific output patterns (banner, tool markers).

Parses:
- Similar structured output to Claude Code but with different formatting
- File operations, thinking state, completion

### Protocol Extension

```typescript
// New message types
TERMINAL_AGENT_EVENT: 'terminal:agent-event'
TERMINAL_AGENT_DETECTED: 'terminal:agent-detected'

interface TerminalAgentEventPayload {
  sessionId: string;
  events: AgentEvent[];
}

interface TerminalAgentDetectedPayload {
  sessionId: string;
  agent: string;          // parser name
  displayName: string;
}
```

### Frontend: Agent Activity Panel

New sidebar panel (collapsible, below file tree or as a tab):

```
┌──────────────────────────────────┐
│ 🤖 Agent Activity                │
│ ┌──────────────────────────────┐ │
│ │ terminal-1: Claude Code      │ │
│ │ Status: 🟡 Thinking...       │ │
│ │                              │ │
│ │ Timeline:                    │ │
│ │  14:32 📖 Read src/index.ts  │ │
│ │  14:32 ✏️ Edit src/utils.ts   │ │
│ │  14:33 🖥️ Run: npm test      │ │
│ │  14:34 📖 Read test/unit.ts  │ │
│ │                              │ │
│ │ Files touched:               │ │
│ │  src/utils.ts (3x)          │ │
│ │  src/index.ts (1x)          │ │
│ │  test/unit.ts (new)         │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ terminal-2: Generic CLI      │ │
│ │ Status: 🟢 Idle              │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### Notification Integration

- Agent completes task → browser notification: "Claude Code finished, modified 3 files"
- Agent encounters error → notification + panel highlights error

### Files to Create/Modify

| File | Change |
|------|--------|
| `packages/agent/src/pty/AgentDetectorRegistry.ts` | New: parser registry + detection logic |
| `packages/agent/src/pty/parsers/AgentParser.ts` | New: parser interface |
| `packages/agent/src/pty/parsers/ClaudeCodeParser.ts` | New: Claude Code output parser |
| `packages/agent/src/pty/parsers/OpenCodeParser.ts` | New: OpenCode output parser |
| `packages/agent/src/pty/parsers/GenericCLIParser.ts` | New: fallback parser |
| `packages/agent/__tests__/pty/parsers/*.test.ts` | New: parser tests |
| `packages/protocol/src/constants.ts` | +2 MessageType |
| `packages/protocol/src/messages.ts` | +2 payload interfaces |
| `apps/web/src/stores/agentActivityStore.ts` | New: agent event state |
| `apps/web/src/components/agent/AgentActivityPanel.tsx` | New: sidebar panel |
| `apps/web/src/components/agent/AgentTimeline.tsx` | New: event timeline |

---

## Milestone 3: File Management

> **Dependency**: None (can be done in parallel with M1/M2)
> **Value**: Eliminates "must use terminal for basic file ops" friction

### 3.1 File Tree CRUD

**New protocol messages**:
```typescript
FILE_CREATE:  'file:create'   // { filePath, type: 'file' | 'directory' }
FILE_CREATED: 'file:created'  // { filePath }
FILE_DELETE:  'file:delete'   // { filePath }
FILE_DELETED: 'file:deleted'  // { filePath }
FILE_RENAME:  'file:rename'   // { oldPath, newPath }
FILE_RENAMED: 'file:renamed'  // { oldPath, newPath }
```

**Agent-side**: New methods in `FileContentService`:
- `createFile(path, type)` — `fs.writeFile` or `fs.mkdir`
- `deleteFile(path)` — `fs.rm` with recursive for directories
- `renameFile(old, new)` — `fs.rename`
- Path validation: must be within rootPath, no `..` traversal

**Frontend UI**:
- Right-click context menu on file tree nodes (New File, New Folder, Rename, Delete)
- Inline rename: double-click → text input replacing filename
- Delete confirmation dialog
- "New File" / "New Folder" buttons at file tree header
- Keyboard: `F2` (rename), `Delete` (delete with confirm)

### 3.2 Quick Open (Ctrl+P)

**Agent-side**: New service `FileSearchService`:
- Indexes file paths on project load (walks directory tree, respects ignore patterns)
- Fuzzy match algorithm (substring + path segment matching)
- Returns top 20 results ranked by relevance
- Index refreshes on `FileWatcher` events

**Protocol**:
```typescript
FILE_SEARCH:      'file:search'       // { query: string }
FILE_SEARCH_DATA: 'file:search-data'  // { results: { path, score }[] }
```

**Frontend**: Modal overlay (`Ctrl+P`):
- Input field with instant results (debounced 100ms)
- Results list with file icons, path highlighting
- Enter to open, Escape to close
- Recent files shown when query is empty

### 3.3 Global Content Search (Ctrl+Shift+F)

**Agent-side**: Uses `ripgrep` (or Node.js fallback) for fast content search.

**Protocol**:
```typescript
CONTENT_SEARCH:      'content:search'       // { query, options }
CONTENT_SEARCH_DATA: 'content:search-data'  // { results: SearchResult[] }
```

**Frontend**: Sidebar search panel:
- Query input with regex toggle
- Results grouped by file
- Click result → open file at matching line
- Result count badge

### Files to Create/Modify

| File | Change |
|------|--------|
| `packages/protocol/src/constants.ts` | +6 MessageType (file CRUD) + 4 (search) |
| `packages/protocol/src/messages.ts` | +10 payload interfaces |
| `packages/agent/src/fs/FileContentService.ts` | +3 methods (create/delete/rename) |
| `packages/agent/src/fs/FileSearchService.ts` | New: file search with fuzzy matching |
| `packages/agent/src/fs/ContentSearchService.ts` | New: ripgrep-based content search |
| `packages/agent/src/transport/WebSocketServer.ts` | Wire new handlers |
| `apps/web/src/components/filetree/FileTreeContextMenu.tsx` | New: right-click menu |
| `apps/web/src/components/search/QuickOpen.tsx` | New: Ctrl+P modal |
| `apps/web/src/components/search/GlobalSearch.tsx` | New: Ctrl+Shift+F panel |
| `apps/web/src/stores/searchStore.ts` | New: search state |

---

## Milestone 4: Shared Terminal Sessions

> **Dependency**: Milestone 0 (OutputDelegate multi-sink capability)
> **Value**: Enables collaborative debugging, AI activity sharing

### Concept

A PTY session can have one **Controller** (read-write) and multiple **Observers** (read-only). Like `tmux attach` but in the browser.

### Architecture

```
PTY session
  ├─ Controller (creator or transferred) — full I/O
  ├─ Observer 1 — read-only, sees same output
  └─ Observer 2 — read-only, sees same output
```

### OutputDelegate Extension

```typescript
class OutputDelegate {
  // Existing
  attach(sink: OutputSink): string;
  detach(): void;

  // New
  addObserver(cb: OutputSink): void;
  removeObserver(cb: OutputSink): void;

  // Modified handler: forwards to sink AND all observers
  readonly handler = (data: string): void => {
    if (this.sink) this.sink(data);
    for (const obs of this.observers) obs(data);
    if (!this.sink && this.observers.size === 0) this.buffer.write(data);
  };
}
```

### Protocol Extension

```typescript
TERMINAL_SHARE:           'terminal:share'            // { sessionId }
TERMINAL_SHARED:          'terminal:shared'           // { sessionId, shareToken, expiresAt }
TERMINAL_JOIN:            'terminal:join'             // { shareToken, mode: 'observe' | 'control' }
TERMINAL_JOINED:          'terminal:joined'           // { sessionId, pid, role, bufferedOutput }
TERMINAL_PEER_UPDATE:     'terminal:peer-update'      // { sessionId, peers: Peer[] }
TERMINAL_REQUEST_CONTROL: 'terminal:request-control'  // { sessionId }
TERMINAL_CONTROL_GRANTED: 'terminal:control-granted'  // { sessionId }

interface Peer {
  id: string;
  role: 'controller' | 'observer';
  joinedAt: number;
}
```

### Share Token

- Format: `vp_<random-12-chars>` (e.g., `vp_a3f8k2m9x1q4`)
- Expiry: 6 hours (configurable)
- Stored in `SharedSessionManager` on agent side
- URL format: `http://host:3000/?share=vp_a3f8k2m9x1q4`

### Control Transfer

1. Default: creator is Controller
2. Observer sends `TERMINAL_REQUEST_CONTROL`
3. Controller receives prompt: "User X requests control. Allow?"
4. If approved → `TERMINAL_CONTROL_GRANTED`, roles swap
5. Optional: "free mode" where anyone can type (configured on share)

### Frontend UI

- Share button on terminal tab → generates link, copy to clipboard
- Observer view: "Read-only" badge, input disabled
- Participants list: small avatars/icons showing who's watching
- Control request: modal dialog for controller to approve/deny

### Security

- Tokens are cryptographically random, short-lived
- Only valid within the same agent instance (no cross-network)
- Optional password protection on share creation
- Rate limiting on join attempts

### Files to Create/Modify

| File | Change |
|------|--------|
| `packages/agent/src/pty/SharedSessionManager.ts` | New: share token management |
| `packages/agent/src/pty/OutputDelegate.ts` | Add observer support |
| `packages/protocol/src/constants.ts` | +7 MessageType |
| `packages/protocol/src/messages.ts` | +7 payload interfaces |
| `packages/agent/src/transport/WebSocketServer.ts` | Share/join/control handlers |
| `apps/web/src/components/terminal/ShareDialog.tsx` | New: share UI |
| `apps/web/src/components/terminal/PeerIndicator.tsx` | New: participants display |

---

## Milestone 5: Polish

> **Dependency**: None (can be done incrementally alongside other milestones)
> **Value**: Elevates perceived quality

### 5.1 Theme System

- Light/dark toggle in header
- CSS variables for all colors (terminal, editor, UI chrome)
- Monaco editor theme sync
- xterm.js theme sync
- Preference stored in `localStorage`

### 5.2 Command Palette (Ctrl+Shift+P)

- Modal overlay with fuzzy search
- Commands: New Terminal, Open File, Toggle Theme, Switch Project, etc.
- Extensible command registry
- Keyboard shortcut hints next to each command

### 5.3 Connection UX

- Skeleton screens during initial connection
- Graceful reconnection UI: "Reconnecting..." overlay with progress
- Connection quality indicator (latency)
- Offline mode: queue actions, replay on reconnect

### 5.4 Terminal Search

- `Ctrl+Shift+F` within terminal: search scrollback buffer
- xterm.js SearchAddon integration
- Highlight matches, prev/next navigation

### 5.5 Layout Persistence

- Save sidebar width, active layout, open tabs to `localStorage`
- Restore on next visit
- "Reset Layout" command in palette

---

## Dependency Graph

```
M0 (Connection Resilience) ← FOUNDATION
 │
 ├─→ M1 (Notifications) ← needs stable connection
 │    │
 │    └─→ M2 (Agent Monitor) ← reuses event bus
 │
 └─→ M4 (Shared Sessions) ← needs OutputDelegate

M3 (File Management) ← INDEPENDENT, parallel with M1/M2

M5 (Polish) ← INDEPENDENT, incremental
```

## Estimated Scope

| Milestone | New Files | Modified Files | Complexity |
|-----------|-----------|----------------|------------|
| M0 | 3 | 9 | Medium (in progress) |
| M1 | 6 | 4 | Medium |
| M2 | 9 | 3 | Medium-High |
| M3 | 7 | 4 | Medium |
| M4 | 4 | 4 | High |
| M5 | 5 | 6 | Low-Medium |

## Design Principles

1. **Agent-side processing**: Heavy work (event detection, parsing, search) runs on the agent, not the browser
2. **Type-safe protocol**: Every new feature extends `MessagePayloadMap` with compile-time safety
3. **Progressive enhancement**: Each milestone works independently; partial implementation is still useful
4. **Conservative detection**: Event detectors prefer false negatives over false positives
5. **No breaking changes**: All new features are additive to the existing protocol and UI
