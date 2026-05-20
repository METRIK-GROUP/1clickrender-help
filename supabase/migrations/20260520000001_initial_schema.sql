-- 1clickrender-help initial schema
-- Tables: sessions, messages, rate_limit, kb_gaps, feedback, daily_reports

create extension if not exists pgcrypto;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  token text unique,
  ip_hash text not null,
  lang text not null default 'pt-br' check (lang in ('pt-br','en','es')),
  plugin_context jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  has_image boolean not null default false,
  image_description text,
  error_log_excerpt text,
  tokens_in int,
  tokens_out int,
  latency_ms int,
  created_at timestamptz not null default now()
);

create table rate_limit (
  key text primary key,
  window_start timestamptz not null,
  count int not null default 0
);

create table kb_gaps (
  id uuid primary key default gen_random_uuid(),
  cluster_label text not null,
  sample_questions text[] not null,
  frequency int not null,
  suggested_kb_path text,
  status text not null default 'open' check (status in ('open','drafted','published','dismissed')),
  github_issue_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  comment text,
  created_at timestamptz not null default now()
);

create table daily_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date unique not null,
  markdown_content text not null,
  metrics jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_messages_session on messages(session_id);
create index idx_messages_created on messages(created_at desc);
create index idx_kb_gaps_status on kb_gaps(status);
create index idx_rate_limit_window on rate_limit(window_start);
create index idx_daily_reports_date on daily_reports(report_date desc);

-- RLS: enable on all tables, NO public policies. Access only via service_role from Edge Functions.
alter table sessions enable row level security;
alter table messages enable row level security;
alter table rate_limit enable row level security;
alter table kb_gaps enable row level security;
alter table feedback enable row level security;
alter table daily_reports enable row level security;
