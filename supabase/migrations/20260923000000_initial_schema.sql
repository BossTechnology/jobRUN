-- jobRUN · Supabase schema (Postgres)
-- Run in the Supabase SQL editor. Column names mirror the prototype's data model.

create extension if not exists "uuid-ossp";
create extension if not exists postgis;

-- Property management companies (PINCH customers)
create table customers (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  email_domain  text,
  created_at    timestamptz default now()
);

-- People at the customer who send requests
create table contacts (
  id            uuid primary key default uuid_generate_v4(),
  customer_id   uuid references customers(id) on delete cascade,
  full_name     text not null,
  email         text,
  phone         text,
  active        boolean default true,
  created_at    timestamptz default now()
);

-- PINCH locations (imported from properties_list CSV)
create table properties (
  id             uuid primary key default uuid_generate_v4(),
  customer_id    uuid references customers(id),
  name           text not null,
  type           text check (type in ('multifamily','singlefamily','student','commercial','residential')),
  address1       text, address2 text, city text, state text, postal_code text,
  lat            double precision, lng double precision,
  geom           geography(point, 4326),
  units_count    int default 0,
  cleaners_count int default 0,
  manager_name   text, manager_phone text, manager_email text,
  default_team_id uuid,
  registered_at  date,
  origin         text,
  created_at     timestamptz default now()
);
create index properties_geom_idx on properties using gist (geom);
create index properties_state_idx on properties (state);

-- Cleaning teams (PINCH Pros)
create table cleaning_teams (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  phone         text,
  email         text,
  subscription  text,             -- Member, O.G., Max, Elite, Elite FP, Quick Pay, Partner, Partner FP
  quick_pay     boolean default false,
  service_states text[],          -- states served
  home_lat      double precision, home_lng double precision,
  created_at    timestamptz default now()
);
alter table properties add constraint properties_team_fk
  foreign key (default_team_id) references cleaning_teams(id);

-- Operations team members
create table operators (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  email      text unique,
  active     boolean default true
);

-- Jobs: one row per job, stage as in the board
create type job_stage as enum ('pending','scheduled','in_progress','complete','validation');

create table jobs (
  id              bigserial primary key,           -- shown as #10402
  stage           job_stage not null default 'pending',
  stage_at        timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  property_id     uuid references properties(id),
  customer_id     uuid references customers(id),
  contact_id      uuid references contacts(id),
  unit            text,
  service         text,                            -- turnover, deep_clean, post_construction, common_areas, guest_suite, porter
  owner_id        uuid references operators(id),
  assigned_at     timestamptz,
  sender_confirmed boolean default false,
  sender_confirmed_by text,                        -- 'ai' | 'human'
  team_id         uuid references cleaning_teams(id),
  team_confirmed  boolean default false,
  team_asked_at   timestamptz,
  window_date     date,
  window_start    time,
  window_end      time,
  access_notes    text,
  price           numeric(10,2),
  cleaner_pay     numeric(10,2),
  quick_pay       boolean default false,
  flagged         boolean default false,
  delayed         boolean default false,
  paid            boolean default false,
  paid_at         timestamptz,
  po_status       text,                            -- 'ok' | 'missing' | 'pending'
  rating_pinch    smallint,
  rating_customer smallint,
  evidence_pdf_sent boolean default false,
  zendesk_ticket  text,
  workapp_id      text,
  tracwork_id     text,
  quickbooks_bill_id text,
  request_channel text,                            -- gmail | twilio | truedialog | platform
  request_subject text,
  request_body    text,
  ai_confidence   smallint,
  field_sources   jsonb default '{}'::jsonb        -- {"unit":"ai","date":"human",...}
);
create index jobs_stage_idx on jobs (stage);
create index jobs_property_idx on jobs (property_id);
create index jobs_owner_idx on jobs (owner_id);

-- Every stage transition and assignment → timestamps power alerts and metrics
create table job_events (
  id          bigserial primary key,
  job_id      bigint references jobs(id) on delete cascade,
  at          timestamptz not null default now(),
  actor_type  text not null,                        -- 'human' | 'ai' | 'rule' | 'system'
  actor       text,
  from_stage  job_stage,
  to_stage    job_stage,
  kind        text not null,                        -- 'stage', 'assign', 'field', 'note'
  detail      jsonb
);
create index job_events_job_idx on job_events (job_id, at);

-- Unified thread: email, SMS, notes, automated messages
create table messages (
  id          bigserial primary key,
  job_id      bigint references jobs(id) on delete cascade,
  at          timestamptz not null default now(),
  channel     text not null,                        -- 'email' | 'sms' | 'note' | 'auto'
  direction   text not null,                        -- 'in' | 'out'
  from_name   text,
  from_addr   text,
  body        text,
  read_at     timestamptz,                          -- null while unanswered → blue indicator
  external_id text                                  -- Gmail message id, TrueDialog id, Zendesk comment id
);
create index messages_job_idx on messages (job_id, at);

-- Actions taken from the Actions menu (each with a reason)
create table job_actions (
  id       bigserial primary key,
  job_id   bigint references jobs(id) on delete cascade,
  at       timestamptz not null default now(),
  by_name  text,
  action   text not null,                           -- reschedule, change_team, change_service, cancel, extra_work, delay, partial, end_manual, reject, addon
  reason   text not null,
  payload  jsonb
);

create table job_addons (
  id       bigserial primary key,
  job_id   bigint references jobs(id) on delete cascade,
  at       timestamptz not null default now(),
  by_name  text,
  addon    text not null,                           -- fridge, oven, carpet, windows, balcony, garage
  price    numeric(10,2),
  cleaner_pay numeric(10,2),
  note     text
);

-- Job Tracker evidence and timing
create table evidence (
  id          bigserial primary key,
  job_id      bigint references jobs(id) on delete cascade,
  kind        text not null,                        -- 'before' | 'after'
  url         text not null,
  taken_at    timestamptz,
  lat         double precision, lng double precision
);

create table tracker (
  job_id       bigint primary key references jobs(id) on delete cascade,
  arrived_at   timestamptz,
  arrive_lat   double precision, arrive_lng double precision,
  started_at   timestamptz,
  ended_at     timestamptz,
  cleaner_notes text
);

-- Realtime: enable on the tables the board listens to
alter publication supabase_realtime add table jobs, messages, job_events, job_actions;

-- Row level security: enable and grant to authenticated operators (adjust to your auth model)
alter table jobs enable row level security;
alter table messages enable row level security;
create policy "operators read" on jobs for select to authenticated using (true);
create policy "operators write" on jobs for update to authenticated using (true);
create policy "operators read msgs" on messages for select to authenticated using (true);
create policy "operators write msgs" on messages for insert to authenticated with check (true);

-- Helper view: unanswered messages per job (drives the blue indicator)
create view jobs_unanswered as
  select j.id as job_id, count(m.id) as unanswered
  from jobs j join messages m on m.job_id = j.id
  where m.direction = 'in' and m.read_at is null
  group by j.id;
