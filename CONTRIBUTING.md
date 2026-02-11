# Contributing to VibePilot

Thank you for your interest in contributing to VibePilot! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)

## Code of Conduct

Please be respectful and considerate in all interactions. We aim to foster an inclusive and welcoming community.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vibepilot.git
   cd vibepilot
   ```
3. **Add upstream remote:**
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/vibepilot.git
   ```

## Development Setup

### Prerequisites

- **Node.js** 20.0.0 or higher
- **pnpm** 9.15.0 (enforced by packageManager field)
- **Git** for version control

### Installation

```bash
# Install dependencies
pnpm install

# Build protocol first (required by other packages)
pnpm --filter protocol build

# Verify setup
pnpm test
```

### Running the Development Environment

**Option 1: Run all packages simultaneously**

```bash
pnpm dev
```

**Option 2: Run packages individually (recommended for debugging)**

Terminal 1 — Agent:

```bash
pnpm --filter agent dev
# Starts on ws://localhost:9800
```

Terminal 2 — Web:

```bash
pnpm --filter web dev
# Starts on http://localhost:3000
```

Terminal 3 — Signaling Server (optional, for WebRTC):

```bash
pnpm --filter signaling-server dev
# Starts on ws://localhost:9801
```

## Project Structure

VibePilot is a **pnpm monorepo** with Turbo caching:

```
vibepilot/
├── packages/
│   ├── protocol/       # @vibepilot/protocol - Zero-dependency message protocol
│   └── agent/          # @vibepilot/agent - Node.js backend (PTY, WebSocket, WebRTC)
├── apps/
│   └── web/            # @vibepilot/web - Next.js 15 frontend
├── signaling-server/   # Standalone WebRTC signaling relay
├── turbo.json          # Turbo pipeline configuration
└── pnpm-workspace.yaml # Workspace definition
```

### Key Files

- **CLAUDE.md** — Comprehensive architecture documentation (read this!)
- **vitest.workspace.ts** — Test configuration for all packages
- **tsconfig.base.json** — Shared TypeScript configuration

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Your Changes

Follow the [Code Style](#code-style) guidelines below.

### 3. Write Tests

All new features must include tests. See [Testing](#testing) section.

### 4. Run Tests Locally

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter protocol test
pnpm --filter agent test
pnpm --filter web test

# Watch mode for TDD
pnpm --filter agent test:watch
```

### 5. Build All Packages

```bash
pnpm build
```

Ensure no TypeScript errors.

### 6. Lint Your Code

```bash
pnpm lint
```

Fix any linting errors before committing.

## Code Style

### TypeScript

- **Strict mode enabled** — All type errors must be resolved
- **Explicit return types** for public functions
- **Use const over let** when possible
- **Avoid any** — Use `unknown` if type is truly unknown

#### Example:

```typescript
// ✅ Good
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// ❌ Bad
export function calculateTotal(items: any) {
  return items.reduce((sum: any, item: any) => sum + item.price, 0);
}
```

### React/Next.js

- **Use 'use client' directive** only when necessary
- **Prefer server components** in Next.js
- **Extract reusable logic** into custom hooks
- **Use Zustand** for global state (already configured)

### Naming Conventions

- **Files:** PascalCase for components (`TerminalInstance.tsx`), camelCase for utilities (`websocket.ts`)
- **Components:** PascalCase (`<FileTree />`)
- **Functions/Variables:** camelCase (`sendMessage`, `isConnected`)
- **Constants:** UPPER_SNAKE_CASE (`DEFAULT_PORT`, `MESSAGE_TYPE`)
- **Interfaces/Types:** PascalCase (`interface VPMessage`, `type ConnectionState`)

### File Organization

```typescript
// 1. Imports
import { useState } from 'react';
import { MessageType } from '@vibepilot/protocol';

// 2. Types/Interfaces
interface Props {
  sessionId: string;
}

// 3. Constants
const MAX_RETRIES = 3;

// 4. Component/Function
export function MyComponent({ sessionId }: Props) {
  // Implementation
}
```

### Comments

- **Use comments sparingly** — Code should be self-documenting
- **JSDoc for public APIs:**
  ```typescript
  /**
   * Creates a new PTY session with specified options.
   * @param sessionId - Unique session identifier
   * @param options - PTY creation options
   * @returns Object containing the process PID
   */
  create(sessionId: string, options: PtyCreateOptions): { pid: number }
  ```
- **Inline comments** only for non-obvious logic

## Testing

### Testing Philosophy

- **Test behavior, not implementation**
- **Prefer integration tests** over unit tests when practical
- **Mock external dependencies** (WebSocket, file system, PTY)
- **Use descriptive test names:**
  ```typescript
  it('preserves session on disconnect and allows reattach', async () => {
    // Test implementation
  });
  ```

### Test File Naming

- Place tests in `__tests__/` directory
- Name: `ComponentName.test.ts` or `functionName.test.ts`

### Writing Tests

**Protocol tests:**

```typescript
import { describe, it, expect } from 'vitest';
import { createMessage, MessageType } from '../src/index.js';

describe('createMessage', () => {
  it('creates a message with correct type and payload', () => {
    const msg = createMessage(MessageType.TERMINAL_CREATE, {
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
    });
    expect(msg.type).toBe('terminal:create');
    expect(msg.payload.sessionId).toBe('sess-1');
  });
});
```

**Agent tests with mocks:**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { PtyManager } from '../../src/pty/PtyManager.js';

vi.mock('node-pty', () => {
  // Mock implementation
});

describe('PtyManager', () => {
  it('creates a PTY session and returns pid', () => {
    const manager = new PtyManager();
    const { pid } = manager.create('sess-1');
    expect(pid).toBeGreaterThan(0);
  });
});
```

**React component tests:**

```typescript
import { render, screen } from '@testing-library/react';
import { TerminalTabs } from '@/components/terminal/TerminalTabs';

describe('TerminalTabs', () => {
  it('displays active tab title', () => {
    render(<TerminalTabs />);
    expect(screen.getByText('Terminal 1')).toBeInTheDocument();
  });
});
```

### Test Coverage

Aim for:

- **Protocol:** 100% (it's small and critical)
- **Agent:** ≥80%
- **Web:** ≥70%

Check coverage:

```bash
pnpm test -- --coverage
```

## Commit Guidelines

### Commit Message Format

We follow **Conventional Commits** specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types:

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `style:` — Code style changes (formatting, no logic change)
- `refactor:` — Code refactoring (no feature/bug change)
- `perf:` — Performance improvements
- `test:` — Adding or updating tests
- `chore:` — Build process, dependencies, tooling

#### Examples:

```
feat(agent): add session timeout configuration

Add --session-timeout CLI flag to configure PTY session
orphan timeout. Defaults to 300 seconds (5 minutes).

Closes #42
```

```
fix(web): prevent terminal flicker on reconnect

Clear terminal before writing buffered output to avoid
displaying stale data.
```

```
docs: update README with WebRTC setup instructions
```

### Commit Best Practices

- **One logical change per commit**
- **Write descriptive commit messages**
- **Keep commits atomic** — Each commit should be independently buildable
- **Reference issues** in commit footer (`Closes #123`, `Fixes #456`)

## Pull Request Process

### Before Submitting

1. ✅ All tests pass (`pnpm test`)
2. ✅ Code builds without errors (`pnpm build`)
3. ✅ No linting errors (`pnpm lint`)
4. ✅ Commits follow commit guidelines
5. ✅ Branch is up-to-date with main:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

### Creating a Pull Request

1. **Push your branch** to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** on GitHub

3. **Fill out the PR template** (will be provided)

4. **Link related issues** in the description

### PR Title Format

Same as commit messages:

```
feat(web): add keyboard shortcuts for tab navigation
```

### PR Description Template

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

Describe how you tested your changes.

## Screenshots (if applicable)

Add screenshots for UI changes.

## Checklist

- [ ] Tests pass locally
- [ ] Added/updated tests
- [ ] Updated documentation
- [ ] No linting errors
```

### Review Process

- **At least 1 approval** required before merge
- **All CI checks must pass**
- **Address review comments** or explain why not
- **Squash commits** if requested before merge

## Issue Guidelines

### Creating Issues

Use the appropriate template:

- **Bug Report** — For reporting bugs
- **Feature Request** — For suggesting new features

### Bug Reports Should Include:

1. **Description** — What happened vs. what you expected
2. **Steps to Reproduce:**
   ```
   1. Open terminal
   2. Run command X
   3. Refresh page
   4. See error
   ```
3. **Environment:**
   - OS: macOS 14.2
   - Node version: 20.10.0
   - Browser: Chrome 120
4. **Logs/Screenshots** if applicable

### Feature Requests Should Include:

1. **Problem Statement** — What problem does this solve?
2. **Proposed Solution** — How would this feature work?
3. **Alternatives Considered** — Other approaches you've thought of
4. **Additional Context** — Any other relevant information

## Development Tips

### Debugging

**Agent debugging:**

```bash
# Enable verbose logging
DEBUG=* pnpm --filter agent dev
```

**Web debugging:**

- Use React DevTools
- Check browser console for logs
- WebSocket messages are logged with `[WS]` prefix

### Hot Module Replacement

Next.js Turbopack provides fast HMR. Changes to React components should reflect immediately.

**Note:** Agent changes require manual restart (`Ctrl+C` + re-run).

### Working with Protocol Changes

When modifying `@vibepilot/protocol`:

1. Make changes in `packages/protocol/src/`
2. Rebuild: `pnpm --filter protocol build`
3. Restart agent and web to pick up changes

### Database/State Reset

If terminal state gets corrupted:

```bash
# Clear sessionStorage (in browser console)
sessionStorage.clear();

# Restart agent
# Refresh browser
```

## Additional Resources

- **CLAUDE.md** — Deep dive into architecture
- **TypeScript Docs** — https://www.typescriptlang.org/docs/
- **Next.js Docs** — https://nextjs.org/docs
- **Vitest Docs** — https://vitest.dev/guide/

## Getting Help

- **GitHub Discussions** — For questions and discussions
- **GitHub Issues** — For bug reports and feature requests
- **Code Review** — Tag maintainers in PRs for review

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (BSL 1.1).

---

Thank you for contributing to VibePilot! 🚀
