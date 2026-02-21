ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'auto'
  CHECK (theme_preference IN ('light', 'dark', 'auto'));
