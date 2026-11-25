-- Пол участника: часть норм зависит от него
alter table users add column sex text check (sex in ('female', 'male'));

-- Целевой индекс здоровья потока, %
alter table streams add column target_index int not null default 75;

-- Замеры: период, когда участники сдают анализы
create table measurements (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references streams(id) on delete cascade,
  name text not null,
  opens_on date not null,
  deadline date not null,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index measurements_stream_idx on measurements (stream_id, opens_on);

-- Участник залил результаты замера
create table measurement_results (
  membership_id uuid not null references memberships(id) on delete cascade,
  measurement_id uuid not null references measurements(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key (membership_id, measurement_id)
);

-- Значения показателей
create table analysis_values (
  membership_id uuid not null references memberships(id) on delete cascade,
  measurement_id uuid not null references measurements(id) on delete cascade,
  indicator_id text not null,
  value numeric not null,
  comparator text not null default '=' check (comparator in ('=', '<', '>')),
  updated_at timestamptz not null default now(),
  primary key (membership_id, measurement_id, indicator_id)
);

-- Бланки анализов (фото, PDF) — файлы на диске сервера
create table blanks (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id) on delete cascade,
  measurement_id uuid not null references measurements(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime text not null,
  size int not null,
  created_at timestamptz not null default now()
);

-- Журнал доступа модераторов к данным о здоровье участника (обещан в согласии)
create table access_log (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references users(id) on delete set null,
  membership_id uuid not null references memberships(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index access_log_membership_idx on access_log (membership_id, created_at desc);
