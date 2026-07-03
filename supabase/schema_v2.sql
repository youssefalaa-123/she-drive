-- She Drive — Schema v2: AI features
-- Run this in Supabase Dashboard → SQL Editor

-- ─── Streak columns on profiles ──────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_streak  integer default 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longest_streak  integer default 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_ride_date  date;

-- ─── Driver reviews (ratings + comments from passengers) ─────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id             uuid primary key default gen_random_uuid(),
  ride_id        text references rides(id),
  driver_id      text references profiles(id),
  passenger_id   text references profiles(id),
  passenger_name text,
  rating         integer check (rating between 1 and 5),
  comment        text,
  created_at     timestamptz default now()
);

CREATE INDEX IF NOT EXISTS reviews_driver_idx ON reviews(driver_id, created_at desc);

-- ─── Passenger coaching messages (AI-generated) ───────────────────────────────
CREATE TABLE IF NOT EXISTS coaching_messages (
  id            uuid primary key default gen_random_uuid(),
  passenger_id  text references profiles(id),
  message       text,
  streak_days   integer,
  seen          boolean default false,
  created_at    timestamptz default now()
);

CREATE INDEX IF NOT EXISTS coaching_passenger_idx ON coaching_messages(passenger_id, created_at desc);

-- ─── Driver summaries (AI weekly/monthly reports) ────────────────────────────
CREATE TABLE IF NOT EXISTS driver_summaries (
  id            uuid primary key default gen_random_uuid(),
  driver_id     text references profiles(id),
  period_type   text check (period_type in ('weekly', 'monthly')),
  period_start  date,
  period_end    date,
  summary       text,
  stats         jsonb,
  created_at    timestamptz default now()
);

CREATE INDEX IF NOT EXISTS summaries_driver_idx ON driver_summaries(driver_id, created_at desc);

-- ─── RLS (open for now, same pattern as other tables) ────────────────────────
ALTER TABLE reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_summaries  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access reviews"    ON reviews           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full access coaching"   ON coaching_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon full access summaries"  ON driver_summaries  FOR ALL USING (true) WITH CHECK (true);
