-- RACERS Sign-On — database setup. Paste into Supabase SQL editor and run once.
-- All access goes through the Vercel API using the service key; anon/authenticated get no direct table access.

create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'staff' check (role in ('event_staff','event_admin','admin','super_admin','god')),
  event_id uuid,                 -- event_staff only: the one event they can work
  expires_at timestamptz,        -- optional login expiry
  created_by uuid,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  venue text not null default '',
  starts date, ends date,
  status text not null default 'open' check (status in ('draft','open','closed')),
  passenger_min int not null default 16,
  guardian_under int not null default 18,
  waiver_version text not null default 'v1',
  waiver_text text not null default '',
  kiosk_pin text not null default '2468',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists sign_ons (
  id text primary key,
  event_id uuid not null references events(id),
  type text not null check (type in ('driver','passenger')),
  source text not null check (source in ('gate','self','kiosk')),
  first_name text not null default '', last_name text not null default '',
  dob date, licence_number text, state text, class text, expiry date, address text,
  phone text, email text,
  guardian_name text, guardian_phone text,
  flags jsonb not null default '[]',
  result text not null default 'pending' check (result in ('pending','signed','refused')),
  refusal_reason text,
  signed_at timestamptz,
  approved_at timestamptz, approved_by uuid references profiles(id),
  created_by uuid references profiles(id),
  operator text, device text,
  waiver_version text, waiver_text text,
  ocr_source text, ocr_text text,
  qr_token text not null unique,
  licence_img text, licence_back text, photo text, sig text, guardian_sig text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sign_ons_event_idx on sign_ons(event_id, result);
create index if not exists sign_ons_licence_idx on sign_ons(event_id, licence_number);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  who uuid, action text not null, sign_on_id text, event_id uuid, detail jsonb
);

alter table profiles enable row level security;
alter table events enable row level security;
alter table sign_ons enable row level security;
alter table audit_log enable row level security;

insert into storage.buckets (id, name, public) values ('signon','signon',false) on conflict (id) do nothing;

create or replace function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists sign_ons_touch on sign_ons;
create trigger sign_ons_touch before update on sign_ons for each row execute function touch_updated_at();

-- migration if profiles already exists from the first version:
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('event_staff','event_admin','admin','super_admin','god'));
alter table profiles add column if not exists event_id uuid;
alter table profiles add column if not exists expires_at timestamptz;
alter table profiles add column if not exists created_by uuid;

-- event assignments (event_admin / event_staff can hold several events)
create table if not exists event_assignments (
  user_id uuid not null references profiles(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  assigned_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table event_assignments enable row level security;
insert into event_assignments (user_id, event_id) select id, event_id from profiles where event_id is not null on conflict do nothing;

-- amendments and soft delete
alter table sign_ons add column if not exists amended_at timestamptz;
alter table sign_ons add column if not exists amended_by uuid references profiles(id);
alter table sign_ons add column if not exists deleted_at timestamptz;
alter table sign_ons add column if not exists deleted_by uuid references profiles(id);
alter table sign_ons add column if not exists delete_reason text;
alter table audit_log drop constraint if exists audit_log_who_fkey;
alter table audit_log add constraint audit_log_who_fkey foreign key (who) references profiles(id);
