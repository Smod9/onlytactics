-- Per-race environmental conditions (structured columns for queries + JSONB for future fields)
CREATE TABLE IF NOT EXISTS race_conditions (
  race_id                TEXT PRIMARY KEY REFERENCES races(race_id) ON DELETE CASCADE,
  fleet_size             INT NOT NULL,
  laps                   INT NOT NULL DEFAULT 1,
  avg_wind_speed_kts     REAL,
  min_wind_speed_kts     REAL,
  max_wind_speed_kts     REAL,
  baseline_wind_deg      REAL,
  wind_direction_stddev  REAL,
  wind_field_enabled     BOOLEAN NOT NULL DEFAULT false,
  wind_field_intensity_kts REAL,
  course_name            TEXT,
  race_duration_seconds  REAL,
  extra                  JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_race_conditions_wind_speed ON race_conditions (avg_wind_speed_kts);
CREATE INDEX IF NOT EXISTS idx_race_conditions_course ON race_conditions (course_name);

-- Per-user-per-race results
CREATE TABLE IF NOT EXISTS race_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id           TEXT NOT NULL REFERENCES races(race_id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  boat_id           TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  finish_position   INT,
  finish_time_seconds REAL,
  fleet_size        INT NOT NULL,
  points            REAL NOT NULL,
  dnf               BOOLEAN NOT NULL DEFAULT false,
  ocs               BOOLEAN NOT NULL DEFAULT false,
  penalties         INT NOT NULL DEFAULT 0,
  protest_penalties INT NOT NULL DEFAULT 0,
  extra             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (race_id, boat_id)
);

CREATE INDEX IF NOT EXISTS idx_race_results_user ON race_results (user_id);
CREATE INDEX IF NOT EXISTS idx_race_results_race ON race_results (race_id);
CREATE INDEX IF NOT EXISTS idx_race_results_position ON race_results (finish_position);
CREATE INDEX IF NOT EXISTS idx_race_results_user_time ON race_results (user_id, created_at DESC);
