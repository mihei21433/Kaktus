-- Голосовые утренние заявления: файл на диске сервера, длительность
alter table statements add column audio_path text;
alter table statements add column duration_sec int;
