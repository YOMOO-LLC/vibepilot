-- VibePilot Cloud: Agents table
-- Run this in the Supabase SQL Editor or via supabase db push

-- ====================================================================
-- Agents table
-- ====================================================================
-- Stores registered VibePilot agents. Each agent is a running instance
-- of the VibePilot backend on a user's machine.

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  public_url TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version TEXT,
  platform TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, public_url)
);

-- Index for listing agents by owner (most common query)
CREATE INDEX IF NOT EXISTS idx_agents_owner_id ON agents(owner_id);

-- Index for finding stale agents
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen);

-- ====================================================================
-- Row Level Security (RLS)
-- ====================================================================
-- Users can only see and manage their own agents.

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view their own agents
CREATE POLICY "Users can view their own agents"
  ON agents FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- Allow authenticated users to insert their own agents
CREATE POLICY "Users can register their own agents"
  ON agents FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Allow authenticated users to update their own agents
CREATE POLICY "Users can update their own agents"
  ON agents FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid());

-- Allow authenticated users to delete their own agents
CREATE POLICY "Users can delete their own agents"
  ON agents FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

-- Allow service role to bypass RLS (for agent self-registration via service key)
-- This is automatic in Supabase when using the service_role key.

-- ====================================================================
-- Optional: Cleanup function for stale agents
-- ====================================================================
-- Marks agents as offline if they haven't sent a heartbeat in 5 minutes.
-- Can be called via a Supabase cron job (pg_cron extension).

CREATE OR REPLACE FUNCTION cleanup_stale_agents()
RETURNS void AS $$
BEGIN
  UPDATE agents
  SET status = 'offline'
  WHERE status = 'online'
    AND last_seen < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
