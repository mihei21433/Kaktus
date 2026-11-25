-- Пользователи: вход по телефону и/или e-mail
create table users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  email text unique,
  name text not null default '',
  about text not null default '',
  contract text not null default '',
  contract_accepted_at timestamptz,
  profile_completed boolean not null default false,
  consent_version text,
  consent_accepted_at timestamptz,
  ai_transfer boolean not null default false,
  is_moderator boolean not null default false,
  created_at timestamptz not null default now(),
  check (phone is not null or email is not null)
);

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('sms', 'email')),
  target text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index otp_codes_target_idx on otp_codes (target, created_at desc);

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Потоки и модераторы
create table streams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  owner_id uuid not null references users(id),
  timezone text not null default 'Asia/Almaty',
  start_date date not null,
  duration_days int not null default 90,
  goal_deadline text not null default '',
  steps_threshold int not null default 10000,
  require_approval boolean not null default true,
  modules jsonb not null,
  norms jsonb not null,
  created_at timestamptz not null default now()
);

create table stream_moderators (
  stream_id uuid not null references streams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'moderator')),
  primary key (stream_id, user_id)
);

-- Глобальные цели потока (шаблон, копируется участнику при одобрении)
create table stream_goals (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references streams(id) on delete cascade,
  title text not null,
  color text not null,
  hint text not null default '',
  position int not null default 0
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references streams(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected', 'blocked', 'left', 'cancelled')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id) on delete set null,
  -- участник увидел отказ и ввёл другой код
  dismissed_at timestamptz
);
-- У человека одновременно не больше одного действующего участия
create unique index memberships_active_uniq on memberships (user_id) where status in ('pending', 'approved', 'blocked');

-- Данные участника
create table goals (
  id uuid primary key,
  membership_id uuid not null references memberships(id) on delete cascade,
  title text not null,
  color text not null,
  hint text not null default '',
  result text not null default '',
  criteria jsonb not null default '[]',
  custom boolean not null default false,
  split_weekly boolean not null default false,
  position int not null default 0
);

create table interim_goals (
  id uuid primary key,
  membership_id uuid not null references memberships(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  horizon text not null check (horizon in ('day', 'week', 'month', 'quarter')),
  text text not null,
  target numeric,
  unit text,
  progress numeric not null default 0,
  start_date date not null
);

create table tasks (
  id uuid primary key,
  membership_id uuid not null references memberships(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  text text not null,
  date date not null,
  repeat_daily boolean not null default false,
  min_value numeric,
  unit text,
  from_moderator boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index tasks_membership_idx on tasks (membership_id);

create table task_completions (
  task_id uuid not null references tasks(id) on delete cascade,
  date date not null,
  done boolean not null,
  updated_at timestamptz not null default now(),
  primary key (task_id, date)
);

create table statements (
  membership_id uuid not null references memberships(id) on delete cascade,
  date date not null,
  text text not null,
  kind text not null default 'text',
  sent_at timestamptz not null default now(),
  primary key (membership_id, date)
);

create table steps (
  membership_id uuid not null references memberships(id) on delete cascade,
  date date not null,
  count int not null,
  updated_at timestamptz not null default now(),
  primary key (membership_id, date)
);

create table fitness (
  membership_id uuid not null references memberships(id) on delete cascade,
  date date not null,
  norm_id text not null,
  value numeric not null,
  primary key (membership_id, date, norm_id)
);

create table push_tokens (
  token text primary key,
  user_id uuid not null references users(id) on delete cascade,
  platform text not null,
  created_at timestamptz not null default now()
);
