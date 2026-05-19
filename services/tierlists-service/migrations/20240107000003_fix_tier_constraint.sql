-- Drop the hardcoded S/A/B/C/D constraint — tiers are now custom per tier list
ALTER TABLE tierlists.tier_list_entries
  DROP CONSTRAINT IF EXISTS tier_list_entries_tier_check;

-- Replace with a simple non-empty check
ALTER TABLE tierlists.tier_list_entries
  ADD CONSTRAINT tier_list_entries_tier_nonempty CHECK (LENGTH(TRIM(tier)) > 0);
