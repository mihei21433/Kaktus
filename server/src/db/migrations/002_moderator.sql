-- Комментарий модератора к поставленной задаче
alter table tasks add column comment text;

-- Рассылки по потоку
create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references streams(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  text text not null,
  recipients int not null,
  created_at timestamptz not null default now()
);
create index broadcasts_stream_idx on broadcasts (stream_id, created_at desc);
