-- Who sent the original request (the board shows it in the thread and the AI sender card).
alter table jobs add column if not exists request_from text;   -- email address or phone number
alter table jobs add column if not exists request_name text;
