ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_set boolean NOT NULL DEFAULT false;
