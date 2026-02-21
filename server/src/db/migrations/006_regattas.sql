CREATE TABLE IF NOT EXISTS regattas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  num_races INT NOT NULL DEFAULT 3,
  throwout_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regattas_created_by ON regattas (created_by);
CREATE INDEX IF NOT EXISTS idx_regattas_created_at ON regattas (created_at DESC);

CREATE TABLE IF NOT EXISTS regatta_races (
  regatta_id UUID NOT NULL REFERENCES regattas(id) ON DELETE CASCADE,
  race_id TEXT NOT NULL,
  race_number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (regatta_id, race_id),
  UNIQUE (regatta_id, race_number)
);

CREATE INDEX IF NOT EXISTS idx_regatta_races_race_id ON regatta_races (race_id);
