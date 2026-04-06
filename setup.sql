-- ============================================================
-- SmartLiving Home — Supabase Setup Script
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- 1. Create the stores table (one JSON document per user)
CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies — users can only access their own row
CREATE POLICY "Users can select their own store"
  ON stores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own store"
  ON stores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own store"
  ON stores FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Auto-update updated_at on every row modification
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Enable Realtime for the stores table
ALTER PUBLICATION supabase_realtime ADD TABLE stores;
