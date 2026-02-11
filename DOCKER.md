# Docker Deployment Guide

This guide explains how to run VibePilot using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- 2GB+ available RAM
- 5GB+ available disk space

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/vibepilot.git
cd vibepilot
```

### 2. Start all services

```bash
docker-compose up -d
```

This will:

- Build and start the agent (WebSocket server on port 9800)
- Build and start the signaling server (WebRTC signaling on port 9900)
- Build and start the web frontend (Next.js on port 3000)

### 3. Access the application

Open your browser and navigate to:

```
http://localhost:3000
```

### 4. Stop services

```bash
docker-compose down
```

## Service Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Docker Host                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │     Web      │  │    Agent     │  │  Signaling   │ │
│  │  (Next.js)   │  │ (WebSocket)  │  │   (WebRTC)   │ │
│  │              │  │              │  │              │ │
│  │  Port: 3000  │  │  Port: 9800  │  │  Port: 9900  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                  │         │
│         └─────────────────┴──────────────────┘         │
│                 vibepilot-network                      │
└─────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

You can customize the deployment by modifying environment variables in `docker-compose.yml`:

#### Agent Service

- `PORT`: WebSocket server port (default: 9800)
- `SESSION_TIMEOUT`: PTY session timeout in seconds (default: 300)
- `SIGNALING_URL`: WebRTC signaling server URL

#### Signaling Server

- `PORT`: Signaling server port (default: 9900)

#### Web Frontend

- `PORT`: Next.js server port (default: 3000)
- `NEXT_PUBLIC_WS_URL`: Agent WebSocket URL (must be accessible from browser)
- `NEXT_PUBLIC_SIGNALING_URL`: Signaling server URL (must be accessible from browser)

### Workspace Volume

The agent mounts a `workspace` directory for file operations:

```yaml
volumes:
  - ./workspace:/workspace:rw
```

This allows the agent to perform file operations within the `/workspace` directory. You can modify this to mount a different directory on your host.

## Advanced Usage

### Build individual services

```bash
# Build only the agent
docker-compose build agent

# Build only the web frontend
docker-compose build web

# Build only the signaling server
docker-compose build signaling
```

### View logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f agent
docker-compose logs -f web
docker-compose logs -f signaling
```

### Rebuild and restart

```bash
# Rebuild and restart all services
docker-compose up -d --build

# Restart a specific service
docker-compose restart agent
```

### Scale services (if needed in the future)

```bash
docker-compose up -d --scale agent=2
```

## Production Deployment

### 1. Update environment variables

Create a `.env` file for production configuration:

```bash
# Agent
AGENT_PORT=9800
SESSION_TIMEOUT=300

# Signaling
SIGNALING_PORT=9900

# Web
WEB_PORT=3000
NEXT_PUBLIC_WS_URL=wss://your-domain.com/ws
NEXT_PUBLIC_SIGNALING_URL=wss://your-domain.com/signaling
```

### 2. Use production compose file

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 3. Set up reverse proxy

Use Nginx or Traefik to:

- Terminate SSL/TLS
- Route `/ws` to agent service
- Route `/signaling` to signaling service
- Route `/` to web frontend

Example Nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Web frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Agent WebSocket
    location /ws {
        proxy_pass http://localhost:9800;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Signaling server
    location /signaling {
        proxy_pass http://localhost:9900;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## Troubleshooting

### Service won't start

Check logs:

```bash
docker-compose logs agent
```

Common issues:

- Port already in use (change port in docker-compose.yml)
- Insufficient memory (increase Docker resource limits)
- Build failures (check Dockerfile and dependencies)

### PTY sessions not working

The agent requires proper TTY support. Ensure:

- Container has sufficient privileges
- `/dev/pts` is accessible

### WebRTC connection fails

Ensure:

- Signaling server is accessible from browser
- Network allows WebSocket upgrades
- Firewall permits required ports

### Performance issues

- Increase Docker resource limits (CPU, memory)
- Use host network mode for better performance (less isolation)
- Optimize volume mounts (use named volumes instead of bind mounts)

## Health Checks

All services include health checks:

```bash
# Check service health
docker-compose ps

# Manually test health
curl http://localhost:9800  # Should return 426 (WebSocket required)
curl http://localhost:9900  # Should return 426 (WebSocket required)
curl http://localhost:3000  # Should return 200 (HTML page)
```

## Security Considerations

- **Never expose agent and signaling ports directly to the internet** - always use a reverse proxy with SSL/TLS
- **Limit workspace volume permissions** - use read-only mounts where possible
- **Use secrets management** - avoid hardcoding sensitive values in docker-compose.yml
- **Keep images updated** - regularly rebuild images to include security patches
- **Enable Docker Content Trust** - verify image signatures

## Backup and Data Persistence

The only persistent data is in the `workspace` volume:

```bash
# Backup workspace
docker run --rm -v vibepilot_workspace:/data -v $(pwd):/backup alpine tar czf /backup/workspace-backup.tar.gz /data

# Restore workspace
docker run --rm -v vibepilot_workspace:/data -v $(pwd):/backup alpine tar xzf /backup/workspace-backup.tar.gz -C /
```

## Development with Docker

For development, use the standard `pnpm dev` commands instead of Docker. Docker is optimized for production deployment.

If you need to develop inside containers:

```bash
# Use docker-compose.dev.yml (create this file if needed)
docker-compose -f docker-compose.dev.yml up
```

## License

See [LICENSE](./LICENSE) for details about the Business Source License 1.1.
