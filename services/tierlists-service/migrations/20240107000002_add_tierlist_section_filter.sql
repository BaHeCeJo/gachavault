ALTER TABLE tierlists.tier_lists
  ADD COLUMN IF NOT EXISTS section_id UUID NULL;
