-- She Drive — Supabase schema
-- Run this once in the Supabase Dashboard → SQL Editor

-- ─── Profiles ────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id            text primary key,          -- Firebase UID
  name          text,
  email         text,
  phone         text,
  role          text check (role in ('passenger', 'driver')),
  wallet        numeric default 0,
  total_trips   integer default 0,
  rating        numeric default 0,
  rating_count  integer default 0,
  approved      boolean default false,
  car_model     text,
  car_color     text,
  plate_number  text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute procedure set_updated_at();

-- ─── Rides ───────────────────────────────────────────────────────────────────
create table if not exists rides (
  id                text primary key,      -- Firestore document ID
  passenger_id      text references profiles(id),
  driver_id         text references profiles(id),
  from_address      text,
  to_address        text,
  distance_km       numeric,
  duration_mins     integer,
  estimated_fare    numeric,
  final_fare        numeric,
  base_fare         numeric,
  card_fee          numeric default 0,
  payment_method    text,
  status            text,
  cancelled_by      text,
  cancellation_fee  numeric default 0,
  is_first_ride     boolean default false,
  driver_earnings   numeric,
  created_at        timestamptz default now(),
  completed_at      timestamptz
);

-- index for fast per-user history queries
create index if not exists rides_passenger_idx on rides(passenger_id, created_at desc);
create index if not exists rides_driver_idx    on rides(driver_id,    created_at desc);

-- ─── Row Level Security (open for now — tighten when Firebase OIDC is added) ─
alter table profiles enable row level security;
alter table rides    enable row level security;

-- Allow all reads/writes via the anon key (app enforces user scoping in code)
create policy "anon full access profiles" on profiles for all using (true) with check (true);
create policy "anon full access rides"    on rides    for all using (true) with check (true);
