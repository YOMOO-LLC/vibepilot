# 技术债务记录

## NAT 穿透功能实施

### Task 1: 数据库 Migration (002_agents_realtime.sql)

**记录日期**: 2026-02-13
**优先级**: P2 (需要在 Phase 3 集成测试前解决)

#### 🔴 Critical Issues

1. **Realtime.messages RLS 策略有效性未验证**
   - **位置**: `supabase/migrations/002_agents_realtime.sql:87-122`
   - **问题**: 设计文档假设 Supabase Realtime 使用 PostgreSQL RLS 保护 `realtime.messages` 表，但实际架构可能不同
   - **风险**: 策略可能不起作用，导致权限控制失效
   - **TODO**: 在 Phase 2-3 实际集成 Supabase Realtime 时验证：
     - Supabase Realtime 是否使用 `realtime.messages` 表？
     - 是否使用 RLS 进行权限控制？
     - 还是使用 JWT claims + Realtime 内置授权？
   - **修复方案**: 如果 Supabase 使用内置授权，删除这些 RLS 策略，通过 Realtime Channel 的 `params` 和 JWT claims 实现权限控制

2. **Broadcast 策略子查询性能和逻辑问题**
   - **位置**: `supabase/migrations/002_agents_realtime.sql:113-118`
   - **问题**:
     ```sql
     channel_name LIKE 'agent:' || (
       SELECT id::text FROM agents WHERE owner_id = auth.uid()
     ) || ':%'
     ```
     每次 INSERT 都执行子查询，且只返回第一个 agent ID
   - **风险**:
     - 性能差（每次消息都查询）
     - 逻辑错误（用户有多个 agent 时，只能访问第一个）
   - **TODO**: 如果保留 RLS 策略，重写为：
     ```sql
     channel_name ~ ('^agent:(' || (
       SELECT string_agg(id::text, '|') FROM agents WHERE owner_id = auth.uid()
     ) || '):')
     ```

3. **Realtime Publication 添加缺少存在性检查**
   - **位置**: `supabase/migrations/002_agents_realtime.sql:84`
   - **问题**: `ALTER PUBLICATION supabase_realtime ADD TABLE agents` 假设 publication 存在
   - **风险**: 在某些环境（如本地开发）可能失败
   - **TODO**: 添加条件检查：
     ```sql
     DO $$
     BEGIN
       IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
         IF NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime' AND tablename = 'agents'
         ) THEN
           ALTER PUBLICATION supabase_realtime ADD TABLE agents;
         END IF;
       END IF;
     END $$;
     ```

#### 🟡 Important Issues

4. **UNIQUE 约束命名不一致**
   - 新建表时创建匿名约束，已存在表时创建命名约束
   - TODO: 统一约束处理逻辑

5. **缺少 table_schema 限定**
   - `information_schema.columns` 查询应该加上 `AND table_schema = 'public'`
   - TODO: 所有 information_schema 查询都添加 schema 限定

#### 决策记录

**为什么接受这些技术债务？**

1. **当前阶段优先级**: Phase 1 目标是建立基础架构，Realtime 策略的有效性需要在 Phase 2-3 集成时验证
2. **测试覆盖**: 当前测试基线健康（99.8% 通过率），这些问题不影响开发进度
3. **务实权衡**: 在实际 Supabase 环境中测试后再修正，避免过早优化

**何时解决？**

- Phase 2 Task 8 (RealtimePresence 实施) - 验证 Presence 频道授权机制
- Phase 3 Task 12 (WebRTCSignaling 实施) - 验证 Broadcast 频道授权机制
- 如果发现 RLS 策略无效，创建新 migration 删除这些策略，使用 Realtime 内置授权

---

### Task 3: Device Auth Callback 页面 (Web)

**记录日期**: 2026-02-13
**优先级**: P0 (必须在 Task 4-6 实施前解决)

#### 🔴 Critical Issues

6. **Agent-Web 参数不匹配**
   - **位置**: `packages/agent/src/auth/DeviceAuthServer.ts:34-41,170`
   - **问题**: 现有 Agent 代码期望的参数与实施计划不符
     - Agent 要求: `expires_in` (秒数), `state` (验证令牌)
     - Web 发送: `expires_at` (时间戳), `user_id` (用户 ID)
     - 现有代码是旧 Device Auth 实现（提交 d6f49ad）
   - **风险**: 100% 认证失败 - Agent 会返回 HTTP 400 "Missing parameters"
   - **决策**: 采用选项 2 - 修改 Agent 匹配实施计划（更现代的设计）
   - **TODO**: 在 Task 4-6 实施 Agent 端时修正

     ```typescript
     // DeviceAuthServer.ts 需要修改：
     const REQUIRED_PARAMS = [
       'access_token',
       'refresh_token',
       'expires_at',      // 改为 expires_at (时间戳)
       'user_id',         // 添加 user_id
       'supabase_url',
       'anon_key',
       // 移除 'state' - 实施计划不使用
     ];

     // Line 170 改为：
     expiresAt: parseInt(url.searchParams.get('expires_at')!, 10),
     userId: url.searchParams.get('user_id')!,
     ```

   - **修复方案**: Task 4 实施 CredentialManager 时同步修正 DeviceAuthServer

#### 决策记录

**为什么采用选项 2（修改 Agent）？**

1. **实施计划更合理**: `expires_at` (绝对时间) 比 `expires_in` (相对时间) 更可靠，避免时钟偏差
2. **简化流程**: 移除 `state` 参数，因为 device flow 本身已足够安全（localhost callback + 浏览器会话验证）
3. **统一修改**: Task 4-6 会重新实施 Agent 认证组件，可以一次性修正所有不一致

**何时解决？**

- Task 4: CredentialManager 实施时修正参数接口
- Task 5: DeviceAuthServer 实施时更新验证逻辑
- Task 6: CLI auth:login 集成测试验证

---

## 解决进度追踪

- [ ] Issue #1: Realtime 策略有效性验证 (Phase 2)
- [ ] Issue #2: Broadcast 策略优化 (Phase 3)
- [ ] Issue #3: Publication 检查修复 (Phase 2)
- [ ] Issue #4: 约束命名统一 (Phase 5)
- [ ] Issue #5: Schema 限定添加 (Phase 5)
- [ ] Issue #6: Agent-Web 参数匹配 (Task 4-6) **🔴 P0**
