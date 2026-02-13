-- =====================================================
-- VibePilot Cloud: Agent Registry & Realtime Setup
-- =====================================================

-- 1. Agents 表 (持久化层)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  version TEXT,
  project_path TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  public_key TEXT,
  UNIQUE(owner_id, name)
);

-- 如果表已存在（从 001 migration），添加新列
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'agents' AND column_name = 'project_path') THEN
    ALTER TABLE agents ADD COLUMN project_path TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'agents' AND column_name = 'tags') THEN
    ALTER TABLE agents ADD COLUMN tags TEXT[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'agents' AND column_name = 'public_key') THEN
    ALTER TABLE agents ADD COLUMN public_key TEXT;
  END IF;
END $$;

-- 处理唯一约束的演进（从 owner_id,public_url 改为 owner_id,name）
DO $$
BEGIN
  -- 删除旧约束（如果存在）
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_owner_id_public_url_key') THEN
    ALTER TABLE agents DROP CONSTRAINT agents_owner_id_public_url_key;
  END IF;

  -- 添加新约束（如果不存在）
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_owner_id_name_key') THEN
    ALTER TABLE agents ADD CONSTRAINT agents_owner_id_name_key UNIQUE (owner_id, name);
  END IF;
END $$;

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_agents_owner_id ON agents(owner_id);
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen DESC);

-- 2. RLS 策略 (用户隔离)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- 删除 001 migration 的旧策略（如果存在）
DROP POLICY IF EXISTS "Users can view their own agents" ON agents;
DROP POLICY IF EXISTS "Users can register their own agents" ON agents;
DROP POLICY IF EXISTS "Users can update their own agents" ON agents;
DROP POLICY IF EXISTS "Users can delete their own agents" ON agents;

-- 创建规范要求的新策略
CREATE POLICY "Users can view own agents"
  ON agents FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert own agents"
  ON agents FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own agents"
  ON agents FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own agents"
  ON agents FOR DELETE
  USING (auth.uid() = owner_id);

-- 3. Realtime 策略
ALTER PUBLICATION supabase_realtime ADD TABLE agents;

-- Realtime Presence 策略
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname = 'Users can manage own presence'
  ) THEN
    CREATE POLICY "Users can manage own presence"
      ON realtime.messages FOR ALL
      USING (
        auth.uid()::text = (payload->>'user_id')::text
        OR channel_name LIKE 'user:' || auth.uid()::text || ':%'
      );
  END IF;
END $$;

-- Realtime Broadcast 策略
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname = 'Users can broadcast to own channels'
  ) THEN
    CREATE POLICY "Users can broadcast to own channels"
      ON realtime.messages FOR INSERT
      WITH CHECK (
        channel_name LIKE 'user:' || auth.uid()::text || ':%'
        OR channel_name LIKE 'agent:' || (
          SELECT id::text FROM agents WHERE owner_id = auth.uid()
        ) || ':%'
        OR channel_name LIKE 'relay:' || (
          SELECT id::text FROM agents WHERE owner_id = auth.uid()
        )
        OR channel_name LIKE 'session:%'
      );
  END IF;
END $$;

-- 4. 可选：表和字段注释
COMMENT ON TABLE agents IS 'VibePilot agents registry with Realtime support. Tracks agent metadata, projects, and online status.';
COMMENT ON COLUMN agents.project_path IS 'Root path of the project this agent is serving';
COMMENT ON COLUMN agents.tags IS 'User-defined tags for organizing agents';
COMMENT ON COLUMN agents.public_key IS 'Agent public key for secure NAT traversal authentication';
