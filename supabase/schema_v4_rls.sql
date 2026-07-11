-- She Drive — Schema v4: row-level RLS + unique review constraint
-- Run in Supabase Dashboard → SQL Editor after deploying settle-ride Edge Function.
--
-- This migration:
--   1. Adds a unique constraint on (ride_id, passenger_id) in reviews
--      to prevent double-submission.
--   2. Tightens RLS policies to per-user row scoping using firebase_uid.
--
-- PRE-REQUISITE: Wire Firebase OIDC → Supabase JWT so auth.uid() returns
-- the Firebase UID.  Steps:
--   a. Firebase Console → Project Settings → Service Accounts →
--      Generate a new private key (JSON).
--   b. Supabase Dashboard → Authentication → JWT Settings →
--      Add a custom JWT secret or JWKS URL:
--        https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com
--   c. Clients must call supabase.auth.signInWithIdToken({ provider:'firebase', token })
--      after each Firebase sign-in so Supabase issues a session with the
--      Firebase UID as the JWT subject.
--
-- Until OIDC is wired, the settle-ride Edge Function uses the service account
-- to bypass RLS for financial writes, so these policies only affect direct
-- anon-key reads.

-- ─── Drop v3 policies ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles select"   ON profiles;
DROP POLICY IF EXISTS "profiles insert"   ON profiles;
DROP POLICY IF EXISTS "profiles update"   ON profiles;
DROP POLICY IF EXISTS "rides select"      ON rides;
DROP POLICY IF EXISTS "rides insert"      ON rides;
DROP POLICY IF EXISTS "rides update"      ON rides;
DROP POLICY IF EXISTS "reviews select"    ON reviews;
DROP POLICY IF EXISTS "reviews insert"    ON reviews;
DROP POLICY IF EXISTS "coaching select"   ON coaching_messages;
DROP POLICY IF EXISTS "coaching update"   ON coaching_messages;
DROP POLICY IF EXISTS "summaries select"  ON driver_summaries;
DROP POLICY IF EXISTS "summaries insert"  ON driver_summaries;

-- ─── Unique review constraint (L-5) ─────────────────────────────────────────
-- Prevents double-submission of a review for the same ride by the same passenger.
ALTER TABLE reviews
  ADD CONSTRAINT IF NOT EXISTS reviews_ride_passenger_unique
  UNIQUE (ride_id, passenger_id);

-- ─── profiles ────────────────────────────────────────────────────────────────
-- Own profile only.  Upsert from settle-ride uses service account (bypasses RLS).
CREATE POLICY "profiles own select" ON profiles FOR SELECT
  USING (auth.uid()::text = id);

CREATE POLICY "profiles own insert" ON profiles FOR INSERT
  WITH CHECK (auth.uid()::text = id);

CREATE POLICY "profiles own update" ON profiles FOR UPDATE
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- ─── rides ───────────────────────────────────────────────────────────────────
-- Passenger or driver of the specific ride.
CREATE POLICY "rides participant select" ON rides FOR SELECT
  USING (
    auth.uid()::text = passenger_id OR
    auth.uid()::text = driver_id
  );

CREATE POLICY "rides passenger insert" ON rides FOR INSERT
  WITH CHECK (auth.uid()::text = passenger_id);

CREATE POLICY "rides participant update" ON rides FOR UPDATE
  USING (
    auth.uid()::text = passenger_id OR
    auth.uid()::text = driver_id
  )
  WITH CHECK (
    auth.uid()::text = passenger_id OR
    auth.uid()::text = driver_id
  );

-- ─── reviews ─────────────────────────────────────────────────────────────────
-- Passengers see reviews they wrote; drivers see reviews about them.
-- INSERT handled by settle-ride Edge Function (service role, bypasses RLS).
CREATE POLICY "reviews driver select" ON reviews FOR SELECT
  USING (
    auth.uid()::text = passenger_id OR
    auth.uid()::text = driver_id
  );

-- ─── coaching_messages ────────────────────────────────────────────────────────
-- Each passenger sees only their own coaching messages.
CREATE POLICY "coaching own select" ON coaching_messages FOR SELECT
  USING (auth.uid()::text = passenger_id);

CREATE POLICY "coaching own update" ON coaching_messages FOR UPDATE
  USING (auth.uid()::text = passenger_id)
  WITH CHECK (auth.uid()::text = passenger_id);

-- ─── driver_summaries ────────────────────────────────────────────────────────
-- Each driver sees only their own summaries.
CREATE POLICY "summaries own select" ON driver_summaries FOR SELECT
  USING (auth.uid()::text = driver_id);

CREATE POLICY "summaries own insert" ON driver_summaries FOR INSERT
  WITH CHECK (auth.uid()::text = driver_id);
