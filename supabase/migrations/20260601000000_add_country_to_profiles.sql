-- Add country_code column to profiles for user country selection.
-- Nullable, max 2 characters (ISO 3166-1 alpha-2 format).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS country_code TEXT CHECK (char_length(country_code) <= 2);
