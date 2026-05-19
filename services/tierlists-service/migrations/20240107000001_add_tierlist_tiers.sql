ALTER TABLE tierlists.tier_lists
  ADD COLUMN IF NOT EXISTS tiers JSONB NOT NULL DEFAULT '[
    {"key":"S","name":"S","color":"#f87171"},
    {"key":"A","name":"A","color":"#fb923c"},
    {"key":"B","name":"B","color":"#facc15"},
    {"key":"C","name":"C","color":"#4ade80"},
    {"key":"D","name":"D","color":"#60a5fa"}
  ]'::jsonb;
