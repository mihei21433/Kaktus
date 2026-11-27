-- Имя и фамилия отдельно (name — «Имя Фамилия» для показа) и фото профиля
alter table users add column first_name text not null default '';
alter table users add column last_name text not null default '';
alter table users add column avatar_path text;
-- Разбираем уже введённые «Имя Фамилия»: фамилия — последнее слово
update users set
  first_name = case when btrim(name) ~ '\s' then regexp_replace(btrim(name), '\s+\S+$', '') else btrim(name) end,
  last_name = case when btrim(name) ~ '\s' then regexp_replace(btrim(name), '^.*\s', '') else '' end;
