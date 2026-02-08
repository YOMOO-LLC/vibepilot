# VibePilot Cloud 设计文档

**日期**: 2026-02-08
**状态**: 设计完成，待实施
**作者**: VibePilot Team

---

## 概述

VibePilot Cloud 是 VibePilot 的远程访问功能扩展，允许用户从任何地方通过浏览器连接到运行在远程服务器上的 Agent，访问终端和文件系统。

### 核心需求

- **场景**: 个人远程访问（在公司浏览器访问家里/远程服务器的 Agent）
- **部署**: Agent 运行在有公网 IP 的云服务器
- **认证**: 支持用户名密码 + OAuth（推荐使用 Supabase）
- **多 Agent**: 一个用户可管理多个 Agent（家里服务器、公司服务器等）
- **连接**: 直连模式（前端直接 WebSocket 到 Agent，无中间层）
- **注册**: Agent 启动时自动注册，定期心跳保持在线状态

### 设计原则

1. **开源友好**: 不强依赖特定云服务，支持自托管
2. **渐进式复杂度**: 单用户模式开箱即用，多用户模式可选
3. **可插拔架构**: 认证层和存储层都是接口，支持多种实现
4. **安全第一**: 传输加密、路径验证、输入校验、权限隔离

---

## 整体架构

### 三层架构

```
┌─────────────────────────────────────────────────────────┐
│                   Web 前端 (Next.js)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Auth Store  │  │  Agent Store │  │ Project Store│  │
│  │  (登录管理)  │  │ (Agent 列表) │  │ (项目选择器) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         └──────────────────┴──────────────────┘          │
└──────────────────────────┬──────────────────────────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐
     │  Agent 1    │ │ Agent 2  │ │  Agent 3   │
     │  (家里Mac)  │ │(阿里云)  │ │ (AWS VPS)  │
     └─────────────┘ └──────────┘ └────────────┘
```

### 用户流程（三层选择）

```
1. 用户登录 (Supabase Auth)
   ↓
2. 选择 Agent ("家里的 Mac" vs "阿里云服务器")
   ↓ WebSocket 直连
3. 选择 Project ("VibePilot" vs "MyApp")
   ↓
4. 开始工作 (Terminal + Editor + File Tree)
```

### 技术栈

- **认证**: jose (JWT), argon2 (密码哈希), Supabase Auth (OAuth)
- **数据库**: PostgreSQL + Kysely (类型安全 SQL)
- **前端**: 复用现有 Next.js + Zustand 架构
- **Agent**: 新增 auth/ 和 registry/ 模块
- **可选**: packages/cloud-server (多用户模式的中心化服务)

---

## 三种部署模式

### 模式 1: 单用户模式（默认，最简单）

**特点**:
- 无需数据库
- 使用固定 Token 认证
- Agent 配置存本地文件 `~/.vibepilot/agents.json`
- 5 分钟部署完成

**使用场景**: 个人单机使用，快速体验

**启动命令**:
```bash
vibepilot serve --token my-secret-token
```

**Docker**:
```bash
docker-compose -f docker-compose.simple.yml up
```

---

### 模式 2: 多 Agent 模式（推荐）

**特点**:
- 需要 PostgreSQL（可用 Docker 容器）
- 认证方式可选:
  - 简化版: 用户名密码（存 PostgreSQL）
  - 完整版: Supabase Auth（或自托管 Supabase）
- 支持管理多台服务器的 Agent
- 项目配置可跨设备同步

**使用场景**: 管理多台服务器，需要用户隔离

**启动命令**:
```bash
# 启动数据库和 cloud-server
docker-compose -f docker-compose.full.yml up -d postgres cloud-server

# 在各台服务器启动 Agent
vibepilot serve \
  --mode multi-user \
  --auth-provider local \
  --registry-provider postgres \
  --database-url postgresql://localhost/vibepilot \
  --agent-name "家里的 Mac" \
  --public-url wss://home.example.com:9800
```

---

### 模式 3: 企业/托管模式（完整功能）

**特点**:
- 官方托管 Web 前端（hosted.vibepilot.cloud）
- 使用 Supabase Cloud（认证 + 数据库）
- 用户只需在自己服务器运行 Agent
- 支持 GitHub/Google OAuth 登录

**使用场景**: 不想自己部署前端的用户

**启动命令**:
```bash
vibepilot serve \
  --mode cloud \
  --auth-provider supabase \
  --supabase-url https://xxx.supabase.co \
  --supabase-key eyJxxx... \
  --registry-provider supabase \
  --agent-name "我的服务器" \
  --public-url wss://my-server.com:9800
```

---

## 核心设计

### 1. 认证层（AuthProvider 接口）

```typescript
export interface AuthProvider {
  verify(credentials: string): Promise<AuthResult>;
  getUserInfo?(userId: string): Promise<UserInfo>;
}
```

**三种实现**:

1. **TokenAuthProvider** (单用户模式)
   - 固定 token 验证
   - 无需数据库
   - userId 固定为 'default'

2. **LocalAuthProvider** (多用户模式)
   - 用户名密码 + JWT
   - 密码使用 argon2 哈希
   - JWT 使用 jose 库签发/验证

3. **SupabaseAuthProvider** (托管模式)
   - 对接 Supabase Auth API
   - 支持邮箱密码 + OAuth
   - JWT 由 Supabase 签发

**WebSocket 握手验证**:
```typescript
// 从 URL 或 Header 提取 credentials
const credentials = extractCredentials(req);

// 验证
const authResult = await authProvider.verify(credentials);

if (!authResult.success) {
  socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
  socket.destroy();
  return;
}

// 建立连接，传递 userId
wss.handleUpgrade(req, socket, head, (ws) => {
  wss.emit('connection', ws, req, authResult.userId);
});
```

---

### 2. Agent 注册层（AgentRegistry 接口）

```typescript
export interface AgentRegistry {
  register(agent: AgentInfo): Promise<AgentInfo>;
  heartbeat(agentId: string): Promise<void>;
  unregister(agentId: string): Promise<void>;
  listByOwner(ownerId: string): Promise<AgentInfo[]>;
  get(agentId: string): Promise<AgentInfo | null>;
}
```

**三种实现**:

1. **FileSystemRegistry** (单用户模式)
   - 存储在 `~/.vibepilot/agents.json`
   - 适合个人使用

2. **PostgresRegistry** (多用户模式)
   - 存储在 PostgreSQL 数据库
   - 支持多用户隔离
   - 定期清理离线 Agent (5 分钟未心跳)

3. **SupabaseRegistry** (托管模式)
   - 使用 Supabase Database
   - 利用 RLS 实现权限隔离

**Agent 启动流程**:
```
1. 初始化 AuthProvider 和 AgentRegistry
2. 调用 registry.register() 注册自己
3. 启动 WebSocket Server
4. 每 30 秒调用 registry.heartbeat() 更新状态
5. SIGTERM 时调用 registry.unregister() 注销
```

---

### 3. 前端连接流程

**三层选择机制**:

```typescript
// 1. 认证层 (authStore)
const { user, token, signInWithPassword, restoreSession } = useAuthStore();

// 2. Agent 层 (agentStore)
const { agents, selectedAgent, loadAgents, selectAgent } = useAgentStore();

// 3. 项目层 (projectStore，复用现有实现)
const { projects, currentProject, loadProjects } = useProjectStore();
```

**自动化流程**:
```
useEffect(() => {
  // 步骤 1: 恢复会话
  restoreSession().then(() => {
    if (token) {
      // 步骤 2: 加载 Agent 列表
      loadAgents().then(() => {
        // 步骤 3: 尝试恢复上次选择的 Agent
        const lastAgentId = localStorage.getItem('vp:lastAgentId');
        if (lastAgentId) {
          selectAgent(lastAgentId);
        }
      });
    }
  });
}, []);

// 步骤 4: 连接成功后加载项目
useEffect(() => {
  if (connectionState === 'connected' && !currentProject) {
    loadProjects(); // 触发项目选择器
  }
}, [connectionState]);
```

---

### 4. 数据库设计（PostgreSQL / Supabase）

**表结构**:

```sql
-- 用户表（Supabase 自动管理）
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent 注册表
CREATE TABLE agents (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  public_url TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('online', 'offline')),
  last_seen TIMESTAMPTZ NOT NULL,
  version TEXT,
  platform TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, public_url)
);

-- 项目配置表（可选，用于跨设备同步）
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  favorite BOOLEAN DEFAULT FALSE,
  color TEXT,
  tags TEXT[],
  last_accessed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agent_id, path)
);
```

**RLS 策略**:
```sql
-- 用户只能访问自己的 Agent
CREATE POLICY "Users can view their own agents"
  ON agents FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can manage their own agents"
  ON agents FOR ALL
  USING (owner_id = auth.uid());

-- 项目同理
CREATE POLICY "Users can manage their own projects"
  ON projects FOR ALL
  USING (owner_id = auth.uid());
```

---

### 5. 与项目选择器的集成

**关系说明**:
- **项目选择器**: 单个 Agent 内的多项目管理（本地路径切换）
- **Cloud**: 多 Agent 管理 + 认证（跨服务器）
- **关系**: 正交且互补

**用户体验**:
```
用户登录
  → 选择 Agent ("家里的 Mac")
    → 连接到 wss://home.example.com:9800
      → 显示项目选择器 ("VibePilot" vs "MyApp")
        → 加载文件树，开始工作
```

**ProjectManager 调整**:
```typescript
export class ProjectManager {
  constructor(options?: {
    configDir?: string;
    userId?: string;  // 新增：多用户模式需要
  }) {
    // 单用户模式
    if (!options?.userId) {
      this.configPath = '~/.vibepilot/projects.json';
    }
    // 多用户模式
    else {
      this.configPath = `~/.vibepilot/users/${options.userId}/projects.json`;
    }
  }
}
```

---

## 安全性设计

### 1. 传输层安全

- **强制 HTTPS/WSS**: 生产环境禁用 HTTP/WS
- **TLS 证书**: 使用 Caddy 自动申请和续期
- **禁用弱协议**: 仅允许 TLS 1.2+

**Caddy 配置**:
```caddyfile
your-domain.com {
  reverse_proxy /ws localhost:9800
  reverse_proxy localhost:3000
}
```

---

### 2. 认证和授权

**JWT 最佳实践**:
- Token 有效期: 7 天
- 包含 issuer 和 audience 验证
- 临期前 24 小时自动刷新
- 使用 HS256 算法

**密码哈希**:
- 使用 argon2id 算法
- 配置: memoryCost=19456, timeCost=2, parallelism=1
- 符合 OWASP 2024 推荐

---

### 3. 路径遍历防护

**多层验证**:
```typescript
export class ProjectValidator {
  static async validate(projectPath: string): Promise<ValidationResult> {
    // 1. 解析并规范化路径
    const resolved = path.resolve(projectPath);

    // 2. 检查系统禁用路径
    if (isForbiddenPath(resolved)) {
      return { valid: false, error: 'System directories forbidden' };
    }

    // 3. 检查敏感文件名
    if (FORBIDDEN_NAMES.has(path.basename(resolved))) {
      return { valid: false, error: 'Sensitive directory name' };
    }

    // 4. 验证路径存在且可读
    const stat = await fs.stat(resolved);
    await fs.access(resolved, fs.constants.R_OK);

    // 5. 解析符号链接并递归验证
    const realPath = await fs.realpath(resolved);
    if (realPath !== resolved) {
      return this.validate(realPath);
    }

    return { valid: true, resolvedPath: resolved };
  }
}
```

**禁止访问的路径**:
- 系统目录: `/`, `/etc`, `/var`, `/usr`, `C:\Windows`
- 敏感文件: `.env`, `.ssh`, `id_rsa`, `.aws`, `.kube`

---

### 4. 输入验证

**使用 Zod Schema**:
```typescript
export const ProjectAddPayloadSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_\- ]+$/),
  path: z.string().min(1).max(1000),
  favorite: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});
```

---

### 5. 速率限制

**连接速率限制**:
- 每个 IP 每分钟最多 5 次连接尝试
- 超过限制返回 429 Too Many Requests
- 定期清理过期记录

---

### 6. 安全响应头

**Web 前端配置**:
```javascript
// next.config.js
headers: [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; connect-src 'self' ws: wss:;"
  },
]
```

---

### 7. 部署前安全检查清单

**必须检查项**:
- [ ] 生产环境禁用默认 token
- [ ] JWT secret 足够强（至少 32 字节随机）
- [ ] 强制使用 HTTPS/WSS
- [ ] TLS 证书有效且未过期
- [ ] Agent 以非 root 用户运行
- [ ] 工作目录权限正确（700 或 750）
- [ ] 数据库使用最小权限账号
- [ ] RLS 策略已启用（Supabase 模式）
- [ ] 所有 payload 使用 zod 验证
- [ ] 路径遍历防护已测试
- [ ] 防火墙仅开放必要端口
- [ ] 运行 pnpm audit 检查依赖漏洞

---

## 配置管理

### 配置文件示例

```javascript
// vibepilot.config.js

module.exports = {
  mode: 'single-user',  // 或 'multi-user' 或 'cloud'

  auth: {
    provider: 'token',
    token: process.env.VP_TOKEN,
    // 或
    provider: 'local',
    secret: process.env.VP_JWT_SECRET,
    // 或
    provider: 'supabase',
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  },

  registry: {
    provider: 'filesystem',  // 或 'postgres' 或 'supabase'
    agentName: process.env.VP_AGENT_NAME,
    publicUrl: process.env.VP_PUBLIC_URL,
  },

  server: {
    port: 9800,
    sessionTimeout: 300,
  },
};
```

### 环境变量模板

参见 `.env.example`:

```bash
# 模式选择
VP_MODE=single-user

# 认证
VP_AUTH_PROVIDER=token
VP_TOKEN=your-secret-token

# Agent 注册
VP_AGENT_NAME=My Server
VP_PUBLIC_URL=wss://your-domain.com:9800

# 数据库（多用户模式）
DATABASE_URL=postgresql://localhost/vibepilot
```

---

## 实施计划

### Phase 1: 核心抽象层（3-4 天）

**目标**: 实现可插拔的认证和注册接口

1. 定义 `AuthProvider` 接口
2. 实现 `TokenAuthProvider`（单用户模式）
3. 定义 `AgentRegistry` 接口
4. 实现 `FileSystemRegistry`（单用户模式）
5. WebSocketServer 集成认证中间件
6. 测试单用户模式端到端流程

**产出**:
- `packages/agent/src/auth/` 模块
- `packages/agent/src/registry/` 模块
- 单用户模式可用

---

### Phase 2: 多用户模式（5-7 天）

**目标**: 实现 PostgreSQL 存储和本地 JWT 认证

1. 创建 `packages/cloud-server` 包
2. 数据库 schema 和迁移
3. 实现 `LocalAuthProvider`
4. 实现 `PostgresRegistry`
5. 前端 `authStore` 和 `agentStore`
6. Agent 选择器 UI
7. 测试多 Agent 管理流程

**产出**:
- `packages/cloud-server` 包
- 数据库迁移文件
- 多用户模式可用

---

### Phase 3: Supabase 集成（3-4 天）

**目标**: 对接 Supabase Auth 和 Database

1. 实现 `SupabaseAuthProvider`
2. 实现 `SupabaseRegistry`
3. 前端集成 Supabase SDK
4. OAuth 登录流程（GitHub, Google）
5. RLS 策略配置
6. 测试 Supabase 模式

**产出**:
- Supabase 集成完成
- OAuth 登录可用

---

### Phase 4: 安全加固和文档（4-5 天）

**目标**: 完善安全措施和部署文档

1. 路径验证增强（符号链接、禁用路径）
2. 输入验证（Zod schema）
3. 速率限制
4. 安全响应头
5. 部署文档（三种模式）
6. 安全检查清单
7. E2E 测试

**产出**:
- 安全加固完成
- 部署文档完善
- 所有测试通过

---

### 总预估工作量

- Phase 1: 3-4 天
- Phase 2: 5-7 天
- Phase 3: 3-4 天
- Phase 4: 4-5 天

**总计**: 15-20 天（约 3-4 周）

---

## 待讨论问题

1. **项目配置同步**: 是否需要将项目配置存到数据库（跨设备同步）？
   - 目前设计：可选，表结构已预留
   - 建议：Phase 2 先不做，Phase 4 根据需求决定

2. **Agent 离线检测**: 5 分钟未心跳标记为离线，是否合理？
   - 可配置化，允许用户自定义超时时间

3. **多用户共享 Agent**: 是否支持团队场景（多人连同一 Agent）？
   - 当前设计：一个 Agent 只能属于一个用户
   - 扩展方案：后续可添加 `agent_users` 关联表

---

## 附录

### A. 文件清单

**新增包**:
- `packages/cloud-server/` — 多用户模式的中心化服务

**新增模块**:
- `packages/agent/src/auth/` — 认证层
- `packages/agent/src/registry/` — 注册层

**新增前端 Store**:
- `apps/web/src/stores/authStore.ts` — 认证状态管理
- `apps/web/src/stores/agentStore.ts` — Agent 列表管理

**新增前端组件**:
- `apps/web/src/components/auth/LoginScreen.tsx`
- `apps/web/src/components/agent/AgentSelectorScreen.tsx`
- `apps/web/src/components/agent/AgentCard.tsx`

**配置文件**:
- `.env.example` — 环境变量模板
- `vibepilot.config.js` — 配置文件示例
- `docker-compose.simple.yml` — 单用户模式
- `docker-compose.full.yml` — 多用户模式
- `docker-compose.supabase.yml` — Supabase 模式

---

### B. 依赖清单

**新增依赖**:
```json
{
  "jose": "^5.2.0",           // JWT 签发/验证
  "argon2": "^0.31.2",        // 密码哈希
  "kysely": "^0.27.3",        // SQL builder
  "pg": "^8.11.3",            // PostgreSQL 驱动
  "zod": "^3.22.4",           // Schema 验证
  "@supabase/supabase-js": "^2.39.0"  // Supabase SDK (可选)
}
```

---

## 总结

VibePilot Cloud 设计采用**可插拔架构**和**渐进式复杂度**，确保：

1. ✅ **易于部署**: 单用户模式 5 分钟上手
2. ✅ **功能完整**: 多用户模式支持企业场景
3. ✅ **开源友好**: 不强依赖特定云服务
4. ✅ **足够安全**: 传输加密、认证授权、输入验证、权限隔离
5. ✅ **扩展性强**: 接口抽象，易于添加新的认证/存储方式

与现有的**项目选择器**功能完美互补，形成**两层选择**架构：
- **Cloud 层**: 用户 → Agent（跨服务器）
- **项目层**: Agent → Project（本地路径）

---

**下一步**: 根据实施计划，从 Phase 1 开始逐步实现。
