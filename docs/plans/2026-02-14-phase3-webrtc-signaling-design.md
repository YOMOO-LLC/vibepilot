# Phase 3: WebRTC 信令层设计文档

**日期**: 2026-02-14
**状态**: 已批准
**作者**: Claude (Brainstorming Session)

---

## 执行摘要

Phase 3 实现 NAT 穿透场景下的 WebRTC P2P 连接。通过 Supabase Realtime Broadcast 交换信令（SDP offer/answer 和 ICE candidates），建立 Browser-Agent 之间的 DataChannel，支持低延迟的终端、文件传输和浏览器预览。

**核心特性**：
- 按需创建信令 channel（节省 Supabase Realtime 资源）
- 自动重试机制（提高连接成功率）
- 完整的错误处理和超时保护
- 与现有 P2P 模式（WebSocket 直连）共存

---

## 背景与目标

### 现状

**Phase 1-2 已完成**：
- ✅ PostgreSQL agents 表 + Realtime Publication
- ✅ Agent 启动时自动注册 + Realtime Presence 广播
- ✅ Web agentStore 订阅 Presence 跟踪在线状态
- ✅ Agent 列表 UI（/agents 页面）

**现有 WebRTC 基础**：
- Agent: `WebRTCPeer` (node-datachannel) - 可以 handleOffer/addIceCandidate
- Web: `VPWebRTCClient` - 可以 createOffer/handleAnswer/addIceCandidate
- 三个 DataChannel: terminal-io, file-transfer, browser-stream

**缺失**：信令层（交换 SDP 和 ICE candidates）

### 目标

1. **实现 Cloud 模式 WebRTC 信令**：通过 Supabase Realtime Broadcast 交换信令
2. **资源优化**：按需创建信令 channel，避免长期占用连接
3. **可靠性**：自动重试、超时保护、错误处理
4. **向后兼容**：不破坏现有 P2P 模式（WebSocket 直连）

### 非目标

- ❌ Relay Server 实施（Phase 4）
- ❌ 修改现有 P2P 模式的 transportManager
- ❌ 优化 WebRTC 性能（DataChannel 配置、编解码器等）

---

## 设计决策

### 决策 1：信令通道选择

**选择**：纯 Supabase Realtime Broadcast（Cloud 模式）

**原因**：
- NAT 穿透场景下，Agent 在防火墙/NAT 后，无法直接 WebSocket 连接
- 既然 Agent 都通过 Supabase 注册，统一使用 Cloud 模式
- 避免混合架构的复杂度（P2P 用 WebSocket，Cloud 用 Broadcast）

**替代方案（已拒绝）**：
- 混合方案（Cloud 用 Broadcast，P2P 用 WebSocket）→ 过度设计，YAGNI

### 决策 2：连接发起方向

**选择**：Browser 始终发起（创建 offer）

**原因**：
- 符合 Client-Server 模式
- 实现简单，逻辑清晰
- Agent 作为"服务器"角色，被动响应

**替代方案（已拒绝）**：
- Agent 发起 → 需要推送机制，复杂度高
- 双向发起 → 需要协商，处理竞争条件

### 决策 3：信令 Channel 生命周期

**选择**：按需创建，用完清理（方案 B）

**原因**：
- 节省 Supabase Realtime 配额（免费套餐 200 并发连接）
- 用户可能有多个 Agent，长期占用浪费资源
- 通过 Presence channel 实现"敲门"机制，复杂度可控

**资源占用对比**：

| 方案 | 空闲时 | 连接中 | 用户有 10 个 Agent |
|------|--------|--------|-------------------|
| A：长期监听 | 11 个连接 | 11 个连接 | 11 个连接 |
| B：按需创建 | 1 个连接 | 2 个连接 | 1 个连接（空闲）|

**替代方案（已拒绝）**：
- 方案 A（长期监听）→ 资源浪费，扩展性差
- 方案 C（混合，短期缓存）→ 过早优化，可在 Phase 4 考虑

### 决策 4：错误处理策略

**选择**：自动重试 3 次，失败后显示错误

**原因**：
- 提高连接成功率（网络抖动、Supabase 暂时不可用）
- 用户无需手动操作，体验更好
- 3 次重试 + 3 秒间隔 = 最多 9 秒延迟，可接受

**替代方案（已拒绝）**：
- 失败后保持 WebSocket 连接 → Cloud 模式下 WebSocket 不可用
- 手动重试 → 用户体验差

---

## 架构设计

### 核心组件

**Agent 端（3 个新组件）**：
1. **WebRTCSignaling** - 监听 Presence channel，按需创建信令 channel
2. **WebRTCPeer** - 现有组件，处理 SDP/ICE（无需修改）
3. **启动集成** - 在 `vibepilot.ts` 中初始化

**Web 端（3 个新组件）**：
1. **WebRTCSignaling** - 发送连接请求，管理信令流程
2. **VPWebRTCClient** - 现有组件（无需修改）
3. **agentStore.selectAgent()** - 触发连接的入口

### 信令通道设计

**Presence Channel**（已有，复用）：
- Channel: `user:{userId}:agents`
- 用途：广播在线状态 + "敲门"机制
- 生命周期：Agent 启动到关闭

**Signaling Channel**（按需创建）：
- Channel: `agent:{agentId}:signaling`
- 用途：交换 SDP offer/answer 和 ICE candidates
- 生命周期：连接请求 → WebRTC 建立 → 2 分钟后自动清理

### 完整消息流程

```
Browser                    Presence Channel              Agent
  |                              |                         |
  |---CONNECTION_REQUEST-------->|------------------------>| (1)
  |    { agentId }               |                         |
  |                              |                         | 创建信令 channel
  |                              |                         |
  |<------CONNECTION_READY-------|<------------------------| (2)
  |    { agentId }               |                         |
  |                              |                         |
  | 创建信令 channel              |                         |
  |                              |                         |
  |                      Signaling Channel                 |
  |---OFFER-------------------->|------------------------>| (3)
  |   { sdp }                    |                         |
  |                              |                         |
  |<---ANSWER-------------------|--------------------------| (4)
  |   { sdp }                    |                         |
  |                              |                         |
  |<->CANDIDATE<--------------->|<------------------------->| (5)
  |   { candidate, sdpMid }      |                         |
  |                              |                         |
  |====== WebRTC DataChannel 连接建立 ======              |
  |                              |                         |
  | 关闭信令 channel              |                         | 关闭信令 channel
  |                              |                         |
  |<============== DataChannel 通信 ====================>| (6)
```

---

## 组件详细设计

### Agent 端：WebRTCSignaling

**接口**：

```typescript
export class WebRTCSignaling {
  constructor(
    private supabase: SupabaseClient,
    private userId: string,
    private agentId: string
  ) {}

  // 启动监听（在 Agent 启动时调用一次）
  async start(): Promise<void>

  // 停止监听，清理所有 channel
  async stop(): Promise<void>

  // 处理连接请求（私有）
  private async handleConnectionRequest(payload: { agentId: string }): Promise<void>

  // 处理 offer，生成 answer（私有）
  private async handleOffer(msg: { sdp: string }, channel: RealtimeChannel): Promise<void>

  // 清理信令 channel（私有）
  private scheduleCleanup(channel: RealtimeChannel, delay: number): void
}
```

**关键逻辑**：

1. **start()**: 监听 Presence channel 的 `connection-request` 事件
2. **handleConnectionRequest()**:
   - 检查 `agentId` 是否匹配（忽略其他 Agent 的请求）
   - 创建信令 channel: `agent:{agentId}:signaling`
   - 回复 `CONNECTION_READY`
   - 监听 `offer` 事件
   - 安排 2 分钟后清理
3. **handleOffer()**:
   - 调用 `WebRTCPeer.handleOffer()` 生成 answer
   - 发送 answer
   - 双向转发 ICE candidates
4. **scheduleCleanup()**: 使用 `setTimeout` 自动清理

### Web 端：WebRTCSignaling

**接口**：

```typescript
export class WebRTCSignaling {
  constructor(
    private supabase: SupabaseClient,
    private userId: string
  ) {}

  // 发起连接（agentStore.selectAgent 调用）
  async connect(
    agentId: string,
    onStateChange: (state: ConnectionState) => void
  ): Promise<VPWebRTCClient>

  // 尝试一次连接（私有）
  private async attemptConnection(
    agentId: string,
    client: VPWebRTCClient,
    onStateChange: (state: ConnectionState) => void
  ): Promise<void>

  // 等待 READY 响应（私有）
  private async waitForReady(
    channel: RealtimeChannel,
    agentId: string,
    timeout: number
  ): Promise<boolean>

  // 等待 answer（私有）
  private async waitForAnswer(
    channel: RealtimeChannel,
    timeout: number
  ): Promise<{ sdp: string } | null>

  // 设置 ICE 交换（私有）
  private setupIceExchange(
    client: VPWebRTCClient,
    channel: RealtimeChannel
  ): void

  // 等待连接成功（私有）
  private async waitForConnection(
    client: VPWebRTCClient,
    timeout: number
  ): Promise<void>

  // 延迟辅助函数（私有）
  private delay(ms: number): Promise<void>
}
```

**关键逻辑**：

1. **connect()**: 主入口，包含重试循环（最多 3 次）
2. **attemptConnection()**: 单次连接尝试
   - 发送 `CONNECTION_REQUEST` 到 Presence channel
   - 等待 `CONNECTION_READY`（超时 5 秒）
   - 创建信令 channel
   - 创建并发送 offer
   - 等待 answer（超时 10 秒）
   - 设置 ICE 交换
   - 等待 WebRTC 连接成功（超时 15 秒）
   - 清理信令 channel
3. **waitForXxx()**: 使用 Promise + setTimeout 实现超时等待
4. **重试逻辑**: 捕获异常，间隔 3 秒重试，最多 3 次

---

## 状态机设计

### Browser 端状态

```typescript
type ConnectionState =
  | 'idle'           // 初始状态
  | 'requesting'     // 发送 CONNECTION_REQUEST
  | 'waiting-ready'  // 等待 READY
  | 'creating-offer' // 创建 offer
  | 'waiting-answer' // 等待 answer
  | 'connecting'     // 交换 ICE candidates
  | 'connected'      // DataChannel 打开
  | 'failed'         // 连接失败
  | 'retrying'       // 自动重试中
```

**状态转换**：

```
正常流程：
idle → requesting → waiting-ready → creating-offer → waiting-answer
  → connecting → connected

错误流程：
requesting/waiting-ready/creating-offer/waiting-answer/connecting
  → failed → retrying → requesting

最终失败：
retrying (3次) → failed
```

### Agent 端状态

```typescript
type AgentSignalingState =
  | 'idle'              // 监听 Presence
  | 'channel-created'   // 创建信令 channel
  | 'offer-received'    // 收到 offer
  | 'answer-sent'       // 发送 answer
  | 'connecting'        // 交换 ICE
  | 'connected'         // DataChannel 打开
  | 'cleanup'           // 清理信令 channel
```

**状态转换**：

```
idle → channel-created → offer-received → answer-sent
  → connecting → connected → cleanup → idle
```

---

## 错误处理

### 超时和重试策略

| 阶段 | 超时时间 | 失败后动作 |
|------|---------|-----------|
| 等待 READY | 5 秒 | 重试（最多 3 次） |
| 等待 answer | 10 秒 | 重试 |
| ICE 连接 | 15 秒 | 重试 |
| 总超时 | 30 秒 | 最终失败 |

**重试配置**：

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 3000,      // 3 秒
  backoff: false,        // 固定延迟
}
```

### 错误场景处理

**场景 1：Agent 离线**
- Browser 发送 REQUEST → 等待 5 秒 → 超时 → 重试 3 次 → 显示 "Agent 离线或无响应"

**场景 2：网络中断（ICE 阶段）**
- WebRTC connectionState → 'failed' → 自动重试完整流程

**场景 3：信令 channel 创建失败**
- Supabase 返回错误 → 捕获异常 → 立即重试 → 3 次失败后显示错误

**场景 4：DataChannel 断开**
- DataChannel onclose → 触发重连（从 CONNECTION_REQUEST 开始）

### 清理和资源管理

**信令 channel 清理时机**：
1. WebRTC 连接成功后 2 分钟
2. 连接失败后立即清理
3. Agent 关闭时清理所有 channel
4. Browser 页面关闭时清理

**内存泄漏防护**：
- 使用 `Set<NodeJS.Timeout>` 跟踪所有计时器
- 使用 `Map<string, RealtimeChannel>` 跟踪所有 channel
- `cleanup()` 方法清理所有资源

---

## 测试策略

### 单元测试（TDD）

**Agent 端**：
- ✅ start() 监听 Presence channel
- ✅ handleConnectionRequest() 忽略其他 Agent
- ✅ handleConnectionRequest() 创建信令 channel 并回复 READY
- ✅ handleOffer() 生成 answer 并发送
- ✅ ICE candidates 双向转发
- ✅ 2 分钟后自动清理

**Web 端**：
- ✅ connect() 发送 REQUEST 并等待 READY
- ✅ 超时保护（5秒无响应）
- ✅ 自动重试 3 次
- ✅ ICE candidates 双向转发
- ✅ 状态变化回调正确触发

### 集成测试

**端到端信令流程**：
- 使用真实 Supabase 测试实例
- Agent 启动 → Browser 连接 → WebRTC 建立 → DataChannel 打开
- 验证完整状态变化序列

### Mock 策略

**Supabase Realtime Mock**：
- Mock `channel()`, `subscribe()`, `send()`, `on()`
- 提供 `trigger()` 测试辅助方法模拟事件

**测试覆盖目标**：
- 单元测试：90%+
- 集成测试：端到端信令流程 + 错误场景

---

## Protocol 扩展

在 `@vibepilot/protocol` 中添加新消息类型：

```typescript
export const MessageType = {
  // ... 现有类型 ...

  // WebRTC Signaling (通过 Supabase Broadcast)
  CONNECTION_REQUEST: 'connection-request',
  CONNECTION_READY: 'connection-ready',
  SIGNAL_OFFER: 'signal-offer',      // 已有，复用
  SIGNAL_ANSWER: 'signal-answer',    // 已有，复用
  SIGNAL_CANDIDATE: 'signal-candidate', // 已有，复用
} as const
```

---

## 实施计划

Phase 3 分为 4 个 Task（详细步骤见 implementation plan）：

1. **Task 12**: Agent WebRTCSignaling（监听 REQUEST，处理 offer）
2. **Task 13**: Web WebRTCSignaling（发送 REQUEST，创建 offer）
3. **Task 14**: agentStore 集成（selectAgent 调用 WebRTCSignaling）
4. **Task 15**: 端到端测试和错误场景验证

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Supabase Realtime 延迟高 | 信令慢，用户体验差 | 超时保护 + 重试机制 |
| Realtime Broadcast RLS 策略失效 | 权限控制失效 | Phase 3 Task 12 验证（参考 TECH_DEBT.md Issue #1） |
| 按需创建 channel 增加延迟 | 首次连接慢（~1 秒） | 可接受，换取资源节省 |
| WebRTC 连接失败率高 | 用户无法连接 | 3 次重试 + 详细错误提示；Phase 4 实施 Relay Server |

---

## 未来扩展（Phase 4+）

- **Relay Server 回退**：WebRTC P2P 失败时通过中继服务器传输
- **信令 channel 缓存**：短期保持 channel 打开，减少频繁创建
- **连接质量监控**：收集 WebRTC 统计数据（RTT, 丢包率等）
- **混合传输**：部分数据通过 WebRTC，部分通过 Relay

---

## 附录

### 参考资料

- [Supabase Realtime Broadcast 文档](https://supabase.com/docs/guides/realtime/broadcast)
- [WebRTC API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [node-datachannel](https://github.com/murat-dogan/node-datachannel)
- Phase 1-2 Implementation Plan: `docs/plans/2026-02-13-nat-traversal-implementation.md`
- Technical Debt: `TECH_DEBT.md`

### 术语表

- **NAT 穿透**: 通过 STUN/TURN 等技术建立防火墙后设备之间的 P2P 连接
- **信令 (Signaling)**: 交换 SDP 和 ICE candidates 的过程
- **SDP**: Session Description Protocol，描述媒体会话参数
- **ICE**: Interactive Connectivity Establishment，NAT 穿透协议
- **DataChannel**: WebRTC 中用于任意数据传输的通道
- **Presence**: Realtime 中跟踪在线状态的机制
- **Broadcast**: Realtime 中发送消息到所有订阅者的机制

---

**文档版本**: 1.0
**最后更新**: 2026-02-14
