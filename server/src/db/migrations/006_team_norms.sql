-- Команда модераторов: кто и когда добавил модератора в поток
alter table stream_moderators add column added_at timestamptz not null default now();
alter table stream_moderators add column added_by uuid references users(id) on delete set null;

-- Нормы анализов, которые модератор поменял для своего потока:
-- { "<id показателя>": { "off": true } | { "norm": {lo,hi} } | { "female": {...}, "male": {...} } }
alter table streams add column indicator_norms jsonb not null default '{}'::jsonb;
