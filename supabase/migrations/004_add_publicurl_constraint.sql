-- Add missing unique constraint for (owner_id, public_url)
-- Required by SupabaseUserRegistry.register() ON CONFLICT clause

DO $$
BEGIN
  -- Add unique constraint if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_owner_id_public_url_key') THEN
    ALTER TABLE agents ADD CONSTRAINT agents_owner_id_public_url_key UNIQUE (owner_id, public_url);
  END IF;
END $$;
