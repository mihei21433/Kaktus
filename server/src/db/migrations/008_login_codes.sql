-- Вход без SMS: личный код входа (хранится только отпечаток HMAC, как коды из SMS)
alter table users drop constraint if exists users_check;
alter table users add column login_code_hash text unique;
alter table users add column login_code_set_at timestamptz;
