# Security Policy

## Supported Versions

Currently, VibePilot is in early development (0.1.x). Security updates will be provided for:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

### Preferred Method: Private Security Advisory

1. Go to the [Security tab](https://github.com/YOUR_USERNAME/vibepilot/security)
2. Click "Report a vulnerability"
3. Fill out the advisory form with details

### Alternative Method: Email

Send an email to: **security@your-domain.com** (replace with your actual email)

Include the following information:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

- **Initial Response:** Within 48 hours
- **Progress Update:** Within 7 days
- **Fix Timeline:** Depends on severity (see below)

## Severity Levels

| Severity     | Description                                      | Response Time |
| ------------ | ------------------------------------------------ | ------------- |
| **Critical** | Remote code execution, authentication bypass     | 24-48 hours   |
| **High**     | Privilege escalation, significant data exposure  | 3-7 days      |
| **Medium**   | XSS, CSRF, information disclosure                | 7-14 days     |
| **Low**      | Non-exploitable issues, best practice violations | 14-30 days    |

## Disclosure Policy

- Security issues will be disclosed publicly **after a fix is released**
- We follow a **90-day disclosure timeline** for critical vulnerabilities
- Reporters will be credited in the release notes (unless they prefer anonymity)

## Security Best Practices

When deploying VibePilot in production, follow these guidelines:

### 1. Network Security

```bash
# Use a reverse proxy (nginx/Apache) for HTTPS
location /ws {
    proxy_pass http://localhost:9800;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

- **Always use wss:// (WebSocket over TLS)** in production
- **Restrict access** to ports 9800-9801 with firewall rules
- **Enable CORS properly** if web and agent are on different domains

### 2. File System Isolation

VibePilot's agent runs with the privileges of the user who starts it. To minimize risk:

```bash
# Create a dedicated user with limited permissions
sudo useradd -m -s /bin/bash vibepilot-agent
sudo chown -R vibepilot-agent:vibepilot-agent /path/to/workspace

# Run agent as that user
sudo -u vibepilot-agent vibepilot serve --dir /path/to/workspace
```

- **Never run the agent as root**
- **Use a dedicated workspace directory** with restricted permissions
- **Avoid exposing sensitive directories** (`/etc`, `/root`, `/home`)

### 3. Session Security

- **Session timeout** is enabled by default (5 minutes)
- Configure shorter timeouts for sensitive environments:
  ```bash
  vibepilot serve --session-timeout 60  # 1 minute
  ```
- **WebRTC encryption** is enabled by default (DTLS/SRTP)

### 4. Dependencies

- Regularly update dependencies:
  ```bash
  pnpm update --recursive
  ```
- Monitor security advisories:
  ```bash
  pnpm audit
  ```
- Enable **Dependabot** in your fork for automated updates

### 5. Environment Variables

Never commit sensitive data to version control:

```bash
# ❌ Bad
NEXT_PUBLIC_WS_URL=wss://secret-api-key@production.example.com

# ✅ Good
NEXT_PUBLIC_WS_URL=wss://production.example.com
```

Use `.env.local` for secrets (already in `.gitignore`).

## Known Security Considerations

### 1. PTY Sessions

- **Risk:** Terminal sessions have full shell access
- **Mitigation:** Run agent with limited user permissions, use `--dir` flag to restrict workspace

### 2. File System Access

- **Risk:** FileTreeService can read workspace files
- **Mitigation:** Path validation prevents directory traversal (`../../etc/passwd` blocked)

### 3. WebSocket Origin

- **Risk:** Cross-origin WebSocket hijacking
- **Mitigation:** Implement origin checking in production:
  ```typescript
  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    if (origin !== 'https://your-trusted-domain.com') {
      ws.close();
      return;
    }
    // Continue...
  });
  ```

### 4. WebRTC Data Channels

- **Risk:** Unencrypted data transmission (if DTLS fails)
- **Mitigation:** WebRTC uses DTLS by default; monitor connection state

## Security Hardening Checklist

Before deploying to production:

- [ ] Enable HTTPS/WSS with valid TLS certificates
- [ ] Configure firewall rules (allow only necessary ports)
- [ ] Run agent with non-root user
- [ ] Set appropriate session timeout (`--session-timeout`)
- [ ] Restrict workspace directory permissions
- [ ] Enable origin checking for WebSocket connections
- [ ] Use environment variables for sensitive configuration
- [ ] Set up log monitoring for suspicious activity
- [ ] Enable rate limiting on WebSocket connections
- [ ] Regularly update dependencies (`pnpm audit`)
- [ ] Implement authentication/authorization (if multi-user)

## Bug Bounty Program

We currently do not have a formal bug bounty program. However, we greatly appreciate responsible disclosure and will:

- Publicly credit security researchers (with permission)
- Prioritize fixes for reported vulnerabilities
- Consider future bounty programs as the project matures

## Additional Resources

- [OWASP WebSocket Security](https://owasp.org/www-community/vulnerabilities/WebSocket_Security)
- [WebRTC Security Best Practices](https://webrtc-security.github.io/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

## Contact

For non-security-related questions, please use:

- **GitHub Issues:** For bug reports
- **GitHub Discussions:** For questions and feature requests

For security concerns **only**, use the methods described at the top of this document.

---

Thank you for helping keep VibePilot secure! 🔒
