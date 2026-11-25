-- Напоминания потока: время по часовому поясу потока
alter table streams add column reminders jsonb not null default '{"enabled": true, "morning": "09:00", "evening": "21:00"}';

-- Какие напоминания уже отправлены (не больше одного каждого вида в день)
create table reminder_log (
  membership_id uuid not null references memberships(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('morning', 'evening')),
  sent_at timestamptz not null default now(),
  primary key (membership_id, date, kind)
);
