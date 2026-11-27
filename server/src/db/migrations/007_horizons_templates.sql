-- Сроки целей потока: базовые (день, неделя, 1 и 3 месяца) и свои; любой срок можно выключить
alter table interim_goals drop constraint if exists interim_goals_horizon_check;
alter table streams add column horizons jsonb not null default '[
  {"id": "day", "name": "День", "days": 1, "base": true, "enabled": true},
  {"id": "week", "name": "Неделя", "days": 7, "base": true, "enabled": true},
  {"id": "month", "name": "1 месяц", "days": 30, "base": true, "enabled": true},
  {"id": "quarter", "name": "3 месяца", "days": 90, "base": true, "enabled": true}
]'::jsonb;

-- Шаблон настроек модератора: один на модератора, новый поток получает его при создании
create table moderator_templates (
  user_id uuid primary key references users(id) on delete cascade,
  source_stream text not null,
  settings jsonb not null,
  saved_at timestamptz not null default now()
);
