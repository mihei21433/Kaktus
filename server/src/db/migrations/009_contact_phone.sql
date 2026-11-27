-- Телефон для связи, который участник указывает при регистрации без SMS.
-- Не подтверждён, поэтому отдельно от phone (по phone входят по SMS) и не уникален.
alter table users add column contact_phone text;
create index users_contact_phone_idx on users (contact_phone);
