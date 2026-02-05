CREATE TABLE IF NOT EXISTS races (
  race_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NOT NULL,
  course_name TEXT,
  seed INTEGER,
  leaderboard JSONB NOT NULL DEFAULT '[]'::jsonb,
  winner_id TEXT,
  replay_data JSONB NOT NULL,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_races_finished_at ON races (finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_races_winner ON races (winner_id);
CREATE INDEX IF NOT EXISTS idx_races_course ON races (course_name);

