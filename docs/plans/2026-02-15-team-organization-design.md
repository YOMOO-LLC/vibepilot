# VibePilot 团队组织与迭代规划

**日期**: 2026-02-15
**状态**: 已批准
**作者**: PM Agent (Team Planning Session)

---

## 执行摘要

本文档定义了 VibePilot 下一阶段的功能开发计划，涵盖 5 个核心任务的优先级、依赖关系、验收标准和团队分工。目标是将 VibePilot 从"可用"提升到"好用"——优化登录体验、实现 HTTP 隧道、支持多地点协作、简化 Web UI、并改善 Agent 自动发现。

**核心原则**：
- 基础设施先行（登录、隧道）→ 体验优化（协作、发现）→ 界面打磨（UI 简化）
- 可量化验收标准，每个任务都有明确的完成定义
- 最大化并行度，缩短整体交付时间

---

## 任务总览

| ID | 任务 | 优先级 | 依赖 | 涉及模块 |
|----|------|--------|------|----------|
| #1 | CLI 登录体验优化 | P0 | 无 | agent (auth, config, CLI) |
| #2 | HTTP 隧道方案 | P0 | 无 | protocol, agent (tunnel), web (tunnel) |
| #3 | 多地点协作优化 | P1 | #2 | agent (transport, pty), web (terminal UI) |
| #4 | Web UI 简化 | P2 | #5 | web (components, stores) |
| #5 | Agent 自动发现 | P1 | #1 | web (agentStore, connectionStore, UI) |

---

## 依赖关系图

```
第一阶段 (并行)          第二阶段 (并行)          第三阶段
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ #1 CLI 登录 (P0)│────>│ #5 Agent 发现(P1)│────>│ #4 Web UI (P2)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
┌─────────────────┐     ┌─────────────────┐
│ #2 HTTP隧道 (P0)│────>│ #3 多地点协作(P1)│
└─────────────────┘     └─────────────────┘
```

**关键路径**：#1 → #5 → #4（最长链路，决定整体交付时间）

---

## 任务详细设计

### Task #1: CLI 登录体验优化

**优先级**: P0 (最高)
**依赖**: 无（基础设施任务，应最先启动）
**负责**: 后端开发

#### 背景

当前 Agent 启动时需要用户手动配置 Supabase URL 和 token，首次使用门槛高。需要实现"开箱即用"的登录体验。

#### 技术方案

1. **默认云端点**: `vibepilot serve` 默认连接 `vibepilot.cloud`，除非通过 `--url` 指定其他地址
2. **OAuth Device Flow**: 首次登录时打开浏览器完成 Supabase OAuth，CLI 通过轮询获取 credential
3. **Credential 持久化**: 存储到 `~/.vibepilot/credentials.json`，包含 access_token、refresh_token、expires_at
4. **自动刷新**: access_token 过期前 5 分钟自动使用 refresh_token 刷新

#### 涉及文件

| 文件 | 修改 |
|------|------|
| `packages/agent/bin/vibepilot.ts` | 修改 serve 命令默认参数 |
| `packages/agent/src/auth/SupabaseAuthProvider.ts` | 添加 OAuth device flow |
| `packages/agent/src/config/ConfigManager.ts` | credential 持久化和刷新逻辑 |
| `packages/agent/__tests__/auth/SupabaseAuthProvider.test.ts` | 新增测试 |

#### 验收标准

- [ ] `vibepilot serve` 默认连接到 vibepilot.cloud，无需 `--url` 参数
- [ ] 首次登录通过浏览器 OAuth 完成，CLI 自动接收 credential
- [ ] credential 自动持久化到 `~/.vibepilot/credentials.json`
- [ ] 重启 Agent 后自动使用缓存的 credential，无需重新登录
- [ ] token 过期前自动刷新，用户无感知
- [ ] `vibepilot logout` 命令清除缓存的 credential

---

### Task #2: HTTP 隧道方案

**优先级**: P0 (最高)
**依赖**: 无（独立新功能模块，可与 Task #1 并行）
**负责**: 后端开发 + 前端开发（协作）

#### 背景

当前 Browser Preview 通过 CDP screencast 流传输截图，用户无法使用完整的 DOM 和 DevTools。需要实现 HTTP-over-WebRTC 隧道，让用户在本地浏览器中直接访问远程开发服务器。

#### 技术方案

```
本地浏览器 → Service Worker / Local Proxy
  → HTTP 请求序列化
    → WebRTC data channel (http-tunnel, reliable)
      → Agent HTTP 代理
        → localhost:3000 (远程开发服务器)
          → HTTP 响应
            → WebRTC 返回
              → 本地浏览器渲染
```

**核心组件**：

1. **Agent 端 HTTP 代理** (`packages/agent/src/tunnel/HttpTunnelProxy.ts`)
   - 接收序列化的 HTTP 请求
   - 转发到目标端口（localhost:3000 等）
   - 序列化响应并通过 WebRTC 返回

2. **Web 端隧道客户端** (`apps/web/src/lib/tunnel/HttpTunnelClient.ts`)
   - Service Worker 拦截 HTTP 请求
   - 序列化并通过 WebRTC data channel 发送
   - 还原 HTTP 响应返回浏览器

3. **新增 WebRTC Data Channel**: `http-tunnel` (reliable 模式)

4. **Protocol 扩展**:
   ```typescript
   HTTP_TUNNEL_REQUEST:  'http-tunnel:request'
   HTTP_TUNNEL_RESPONSE: 'http-tunnel:response'
   HTTP_TUNNEL_WS_OPEN:  'http-tunnel:ws-open'
   HTTP_TUNNEL_WS_DATA:  'http-tunnel:ws-data'
   HTTP_TUNNEL_WS_CLOSE: 'http-tunnel:ws-close'
   ```

#### 涉及文件

| 文件 | 修改 |
|------|------|
| `packages/protocol/src/constants.ts` | +5 MessageType |
| `packages/protocol/src/messages.ts` | +5 payload interfaces |
| `packages/agent/src/tunnel/HttpTunnelProxy.ts` | 新增：Agent 端 HTTP 代理 |
| `packages/agent/src/tunnel/WebSocketTunnel.ts` | 新增：WebSocket 隧道支持 |
| `apps/web/src/lib/tunnel/HttpTunnelClient.ts` | 新增：Web 端隧道客户端 |
| `apps/web/src/lib/tunnel/TunnelServiceWorker.ts` | 新增：Service Worker |
| `apps/web/src/components/browser/TunnelButton.tsx` | 新增："在浏览器中打开"按钮 |

#### 验收标准

- [ ] 用户可以在 VibePilot Web 上看到"在浏览器中打开"按钮
- [ ] 点击后在新标签页打开远程 app，有完整的 DOM 和 DevTools
- [ ] 支持 GET/POST/PUT/DELETE 等标准 HTTP 方法
- [ ] 支持 WebSocket 隧道转发（热重载可用）
- [ ] 单请求延迟 ≤500ms（在网络条件良好时）
- [ ] 隧道断开时显示友好的错误提示

---

### Task #3: 多地点协作优化

**优先级**: P1 (高)
**依赖**: Task #2（Browser 预览改进依赖 HTTP 隧道消除抢占问题）
**负责**: 后端开发

#### 背景

多个客户端连接同一 Agent 时，终端会话所有权会转移，Browser 预览被后连接的客户端抢占，导致先连接的客户端体验中断。

#### 技术方案

1. **终端会话广播**: 修改 `sessionOwners` 为 `sessionSubscribers` 机制（一对多）
   - Owner (创建者): 拥有读写权限
   - Subscriber (订阅者): 只读，接收输出广播

2. **会话标识**: 每个终端记录 `creatorClientId` 和创建时间戳

3. **UI 区分**: 前端通过 `creatorClientId` 区分"我的终端"和"其他终端"

4. **Browser 预览**: 使用 HTTP 隧道（Task #2）替代 CDP screencast 共享，从根本上消除抢占问题

#### 涉及文件

| 文件 | 修改 |
|------|------|
| `packages/agent/src/transport/WebSocketServer.ts` | sessionOwners → sessionSubscribers |
| `packages/agent/src/pty/PtyManager.ts` | 添加 creatorClientId 追踪 |
| `packages/agent/src/pty/SessionPersistenceManager.ts` | 多客户端 orphan/reclaim 逻辑 |
| `packages/protocol/src/messages.ts` | 终端消息增加 creatorClientId 字段 |
| `apps/web/src/stores/terminalStore.ts` | 区分"我的终端"和"订阅终端" |
| `apps/web/src/components/terminal/TerminalTab.tsx` | 终端归属标识 UI |

#### 验收标准

- [ ] 多地点可以同时查看同一终端输出（只读模式），延迟 ≤200ms
- [ ] 每个地点创建的终端默认只有创建者有写入权限
- [ ] UI 清晰标识终端归属（显示创建者名称/设备）
- [ ] 使用 HTTP 隧道时，Browser 预览不再出现抢占现象
- [ ] 终端订阅/取消订阅不影响其他客户端的连接

---

### Task #4: Web UI 简化和错误提示改进

**优先级**: P2 (中)
**依赖**: Task #5（连接流程确定后再统一清理 UI，避免重复工作）
**负责**: 前端开发

#### 背景

Web 界面存在未使用的组件、错误提示不及时、加载状态不清晰等问题，需要全面清理和优化。

#### 技术方案

1. **组件审查**: 扫描 `apps/web/src/components/` 目录，通过 import 分析找出未使用的组件并删除

2. **全局错误提示**: 添加 Toast/Notification 系统
   - 推荐使用 `sonner` 或 `react-hot-toast`
   - 统一 error → toast 管道（各 store 的 catch 块调用统一的 `showError()`)

3. **加载状态**: 为所有异步操作添加 loading 指示器
   - 连接中：全屏 overlay + 状态文字
   - 文件加载中：编辑器 skeleton
   - 终端启动中：terminal tab spinner

4. **布局优化**: 确保核心功能区域（终端 + 编辑器 + 预览）占屏幕 ≥80%

#### 涉及文件

| 文件 | 修改 |
|------|------|
| `apps/web/src/components/` | 删除未使用组件（需先审查） |
| `apps/web/src/components/ui/Toast.tsx` | 新增：全局 Toast 组件 |
| `apps/web/src/lib/toast.ts` | 新增：统一的 error/success/info 方法 |
| `apps/web/src/stores/*.ts` | 错误处理逻辑统一化 |
| `apps/web/src/app/layout.tsx` | 挂载 Toast Provider |

#### 验收标准

- [ ] 删除所有未使用的组件文件（需列出删除清单）
- [ ] 连接失败时 2 秒内显示错误 Toast
- [ ] 文件操作失败时显示具体错误信息（不是通用"操作失败"）
- [ ] 加载状态覆盖所有异步操作（连接中、文件加载中、终端启动中）
- [ ] 界面无视觉冗余，核心功能区域占屏幕 ≥80%

---

### Task #5: Agent 自动发现和连接优化

**优先级**: P1 (高)
**依赖**: Task #1（Agent 需要先能自动登录到 vibepilot.cloud）
**负责**: 前端开发

#### 背景

当前用户登录后需要手动从列表选择 Agent 并点击连接，步骤较多。需要实现实时在线状态、自动重连和快速连接。

#### 技术方案

1. **实时在线状态**: 改进 `agentStore` 的 Supabase Presence 监听
   - 在线：绿色指示器
   - 离线：灰色指示器
   - 重连中：黄色脉冲动画

2. **自动重连**: 连接断开后使用指数退避策略自动重连
   ```typescript
   const RECONNECT_CONFIG = {
     maxRetries: 5,
     baseDelay: 1000,     // 1s, 2s, 4s, 8s, 16s
     maxDelay: 30000,
   }
   ```

3. **快速连接**: 简化到 ≤2 次点击（选择 Agent → 自动连接）

4. **连接状态指示器**: 在 header 或 sidebar 显示当前连接状态

#### 涉及文件

| 文件 | 修改 |
|------|------|
| `apps/web/src/stores/agentStore.ts` | Presence 监听优化 |
| `apps/web/src/stores/connectionStore.ts` | 自动重连机制 |
| `apps/web/src/components/agents/AgentList.tsx` | 在线状态指示器 |
| `apps/web/src/components/layout/ConnectionStatus.tsx` | 新增：连接状态组件 |
| `apps/web/src/__tests__/stores/agentStore.test.ts` | 新增测试 |
| `apps/web/src/__tests__/stores/connectionStore.test.ts` | 新增测试 |

#### 验收标准

- [ ] 登录后 3 秒内看到在线 Agents 列表
- [ ] 点击 Agent 快速连接，无需额外步骤（≤2 次点击）
- [ ] 连接断开后 5 秒内自动尝试重连
- [ ] 连接状态清晰可见（在线/离线/重连中三种状态）
- [ ] Agent 下线后 UI 状态实时更新（≤5 秒延迟）

---

## 团队分工

### 角色定义

| 角色 | 职责 | 负责任务 |
|------|------|----------|
| **PM** | 需求管理、优先级排序、验收标准定义 | 全局协调 |
| **后端开发** | Agent 端功能实现、Protocol 扩展 | #1, #2 (Agent 端), #3 |
| **前端开发** | Web UI 实现、Store 逻辑 | #2 (Web 端), #4, #5 |
| **测试** | 测试用例编写、回归测试 | 全部任务的测试验证 |

### 开发阶段

#### 第一阶段：基础设施（并行推进）

```
后端开发: Task #1 (CLI 登录) + Task #2 Agent 端
前端开发: Task #2 Web 端
测试:     为 #1 和 #2 编写测试用例
```

**里程碑**: 用户可以一键启动 Agent 并通过 HTTP 隧道访问远程应用

#### 第二阶段：体验优化（并行推进）

```
后端开发: Task #3 (多地点协作)
前端开发: Task #5 (Agent 自动发现)
测试:     为 #3 和 #5 编写测试用例
```

**里程碑**: 多用户可同时协作，Agent 连接流畅无感

#### 第三阶段：界面打磨

```
前端开发: Task #4 (Web UI 简化)
测试:     UI 回归测试 + 全流程验收
```

**里程碑**: 界面简洁高效，错误提示及时

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| HTTP 隧道 Service Worker 兼容性 | 部分浏览器不支持 | 中 | 准备 iframe + postMessage 降级方案 |
| OAuth Device Flow 安全性 | credential 泄露 | 低 | 短 token 过期时间 + 刷新机制 |
| 多客户端广播性能 | 终端输出延迟增大 | 中 | 设置最大订阅者数（如 10），超限拒绝 |
| Supabase Presence 延迟 | Agent 在线状态不准确 | 中 | 客户端侧定期 heartbeat 校验 |
| 组件删除误伤 | 删除了实际使用的组件 | 低 | 先做 import 分析，删除前 `pnpm build` 验证 |

---

## 开发规范

### 遵循现有约定

- **TDD**: 所有新功能 Red → Green → Refactor
- **Protocol 扩展**: 新消息类型必须添加到 `MessagePayloadMap`，保证编译时类型安全
- **测试框架**: Vitest 3 + jsdom (@testing-library/react) + mocked dependencies
- **命名规范**: MessageType 常量全大写，Store 文件名 camelCase，组件 PascalCase

### 代码审查要点

1. 新增消息类型是否在 `packages/protocol` 中正确注册
2. Store 中的 message handler 是否在 `create()` 回调中注册
3. 错误处理是否覆盖所有异步路径
4. 路径安全校验是否在 Agent 端完成（不信任客户端输入）
5. 测试覆盖率是否达到 90%+

---

## 附录

### 参考文档

- [MVP Experience Roadmap](./2026-02-08-mvp-experience-roadmap.md)
- [VibePilot Cloud Design](./2026-02-08-vibepilot-cloud-design.md)
- [Phase 3 WebRTC Signaling Design](./2026-02-14-phase3-webrtc-signaling-design.md)
- [NAT Traversal Design](./2026-02-13-nat-traversal-design.md)
- [CLI Interactive Config Design](./2026-02-11-cli-interactive-config-design.md)

### 术语表

| 术语 | 含义 |
|------|------|
| HTTP 隧道 | HTTP-over-WebRTC 代理，本地浏览器通过 WebRTC 访问远程 HTTP 服务 |
| Session Subscriber | 终端会话的只读订阅者，接收输出广播但无写入权限 |
| Credential 交换 | CLI 通过 OAuth 流程从浏览器获取认证 token 的过程 |
| Agent 自动发现 | 通过 Supabase Presence 实时检测在线 Agent 的机制 |
| 指数退避 | 重连间隔按指数增长（1s, 2s, 4s...）的策略，避免服务器过载 |

---

**文档版本**: 1.0
**最后更新**: 2026-02-15
