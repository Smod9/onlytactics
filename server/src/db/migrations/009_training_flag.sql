ALTER TABLE races ADD COLUMN IF NOT EXISTS training_approved BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_races_training ON races (training_approved) WHERE training_approved = true;
