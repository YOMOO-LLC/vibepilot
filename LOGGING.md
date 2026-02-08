# Logging Guide

VibePilot uses [pino](https://getpino.io/) for structured, high-performance logging across all backend services (agent and signaling server).

## Features

- **Structured Logging**: All logs are JSON-formatted in production for easy parsing and analysis
- **Pretty Printing**: Development mode includes colorized, human-readable output via `pino-pretty`
- **Log Levels**: Standard levels - trace, debug, info, warn, error, fatal
- **Contextual Data**: Each log entry can include structured metadata
- **High Performance**: pino is one of the fastest Node.js loggers

## Configuration

### Environment Variables

Control logging behavior through environment variables:

```bash
# Log level (default: 'debug' in dev, 'info' in production)
LOG_LEVEL=debug

# Node environment
NODE_ENV=production
```

### Log Levels

Available log levels in order of severity:

| Level | Description | Use Case |
|-------|-------------|----------|
| `trace` | Very detailed debugging | Rare, for deep debugging only |
| `debug` | Detailed debugging information | Development, troubleshooting |
| `info` | General informational messages | Normal operations |
| `warn` | Warning messages | Non-critical issues |
| `error` | Error messages | Recoverable errors |
| `fatal` | Fatal errors | Unrecoverable errors |

## Usage

### Basic Logging

```typescript
import { logger } from './utils/logger.js';

// Simple message
logger.info('Server started');

// With structured data
logger.info({ port: 9800, cwd: '/workspace' }, 'Agent listening');

// Error logging
logger.error({ error: err }, 'Failed to connect');
```

### Creating Named Loggers

Create specialized loggers for different modules:

```typescript
import { createLogger } from './utils/logger.js';

const logger = createLogger('pty-manager');

logger.debug({ sessionId: 'abc123' }, 'PTY session created');
```

### Logging Best Practices

#### 1. Use Structured Data

**Good:**
```typescript
logger.info({ userId, sessionId, duration: 1500 }, 'Session completed');
```

**Avoid:**
```typescript
logger.info(`Session ${sessionId} completed for user ${userId} in ${duration}ms`);
```

#### 2. Choose Appropriate Levels

- `debug`: Internal state, function calls, loop iterations
- `info`: User actions, service lifecycle, business events
- `warn`: Deprecated features, fallback behavior, retryable errors
- `error`: Failed operations, exceptions, data validation errors
- `fatal`: Service crashes, unrecoverable states

#### 3. Include Context

Always include relevant context to make logs useful:

```typescript
logger.error(
  {
    error: err.message,
    stack: err.stack,
    sessionId,
    operation: 'file:read',
    path: filePath,
  },
  'File read operation failed',
);
```

#### 4. Avoid PII in Production

Never log sensitive information:

```typescript
// BAD - logs password
logger.info({ username, password }, 'User login');

// GOOD
logger.info({ username }, 'User login attempt');
```

## Output Formats

### Development (pino-pretty)

```
[12:34:56.789] INFO (@vibepilot/agent): VibePilot Agent started
    port: 9800
    cwd: "/workspace"
    sessionTimeout: "300s"
```

### Production (JSON)

```json
{
  "level": "info",
  "time": "2026-02-08T12:34:56.789Z",
  "name": "@vibepilot/agent",
  "port": 9800,
  "cwd": "/workspace",
  "sessionTimeout": "300s",
  "msg": "VibePilot Agent started"
}
```

## Log Analysis

### Viewing Logs

**Development:**
```bash
pnpm --filter agent dev
# Colorized output to console
```

**Production:**
```bash
node packages/agent/dist/bin/vibepilot.js serve | pino-pretty
# Pipe to pino-pretty for human-readable output
```

### Filtering Logs

Use standard tools to filter JSON logs:

```bash
# Filter by log level
node dist/bin/vibepilot.js | jq 'select(.level >= 40)'

# Filter by logger name
node dist/bin/vibepilot.js | jq 'select(.name == "pty-manager")'

# Extract specific fields
node dist/bin/vibepilot.js | jq '{time, msg, sessionId}'
```

### Log Aggregation

For production deployments, consider using:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Grafana Loki**
- **Datadog**
- **CloudWatch Logs** (AWS)
- **Stackdriver Logging** (GCP)

All produce structured JSON logs that integrate easily with these platforms.

## Performance

Pino is designed for high-performance logging:

- **Asynchronous**: Minimal overhead on the main thread
- **Minimal Allocations**: Efficient memory usage
- **Fast Serialization**: Optimized JSON stringification

### Benchmarks

Pino is typically 5-10x faster than other popular Node.js loggers like Winston or Bunyan.

## Child Loggers

Create child loggers to add persistent context:

```typescript
const sessionLogger = logger.child({ sessionId });

sessionLogger.info('PTY created'); // Automatically includes sessionId
sessionLogger.debug('Output received');
sessionLogger.info('PTY destroyed');
```

## Error Serialization

Pino automatically serializes Error objects:

```typescript
try {
  // operation
} catch (err) {
  logger.error({ err }, 'Operation failed');
  // Includes: err.message, err.stack, err.type
}
```

## Redacting Sensitive Data

Configure pino to redact sensitive fields:

```typescript
const logger = pino({
  redact: {
    paths: ['password', 'apiKey', 'token', '*.password'],
    remove: true,
  },
});

logger.info({ username: 'alice', password: 'secret' });
// Output: {"username":"alice"}
```

## Testing with Logs

Mock the logger in tests:

```typescript
import { vi } from 'vitest';

vi.mock('./utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// In test:
expect(logger.info).toHaveBeenCalledWith(
  { port: 9800 },
  'Server started',
);
```

## Resources

- [Pino Documentation](https://getpino.io/)
- [Best Practices](https://getpino.io/#/docs/best-practices)
- [API Documentation](https://getpino.io/#/docs/api)
- [pino-pretty](https://github.com/pinojs/pino-pretty)

## Migration from console.log

When migrating existing code:

| Old | New |
|-----|-----|
| `console.log(msg)` | `logger.info(msg)` |
| `console.error(msg)` | `logger.error(msg)` |
| `console.warn(msg)` | `logger.warn(msg)` |
| `console.debug(msg)` | `logger.debug(msg)` |

Add structured data where appropriate:

```typescript
// Before
console.log('Connected to', host, 'on port', port);

// After
logger.info({ host, port }, 'Connected');
```
