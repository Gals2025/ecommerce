CREATE TABLE IF NOT EXISTS open_play_showcase (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 draft jsonb NOT NULL DEFAULT '{}'::jsonb,
 published jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);