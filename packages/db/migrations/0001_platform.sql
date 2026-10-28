-- Platform schema: helpers, users/roles, permissions mirror, audit log, approvals.
-- Runs as the owner role. The app connects as app_rw, which cannot bypass row-level security.

create schema if not exists platform;
create schema if not exists app;

-- Request context (set transaction-locally by packages/db withTx) -------------
create or replace function app.user_id() returns text language sql stable as
$$ select nullif(current_setting('app.user_id', true), '') $$;

create or replace function app.roles() returns text[] language sql stable as
$$ select coalesce(nullif(current_setting('app.roles', true), '')::text[], '{}'::text[]) $$;

create or replace function app.request_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.request_id', true), '')::uuid $$;

create or replace function app.app_name() returns text language sql stable as
$$ select coalesce(nullif(current_setting('app.app', true), ''), 'unknown') $$;

create or replace function app.has_role(r text) returns boolean language sql stable as
$$ select r = any(app.roles()) $$;

create or replace function app.is_system() returns boolean language sql stable as
$$ select app.has_role('platform_system') $$;

-- uuid v7 (time-ordered); Postgres 17 has no built-in
create or replace function platform.uuid_v7() returns uuid language plpgsql volatile as $$
declare
  ts bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  b bytea := uuid_send(gen_random_uuid());
begin
  b := overlay(b placing substring(int8send(ts) from 3) from 1 for 6);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
  return encode(b, 'hex')::uuid;
end $$;

-- Users & roles ---------------------------------------------------------------
create table platform.users (
  id            text primary key,              -- Neon Auth user id (or local demo id)
  email         text not null,
  name          text,
  attributes    jsonb not null default '{}',   -- e.g. {"refund_limit_cents": 50000}
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table platform.user_roles (
  user_id    text not null references platform.users(id) on delete cascade,
  role       text not null,
  granted_by text,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table platform.auth_sessions_seen (
  session_id    text primary key,
  user_id       text not null,
  first_seen_at timestamptz not null default now()
);

-- Mirror of the code-defined role -> permission map (synced on migrate)
create table platform.role_permissions (
  role       text not null,
  permission text not null,
  primary key (role, permission)
);

create or replace function app.has_permission(p text) returns boolean
language sql stable security definer set search_path = platform, pg_temp as $$
  select app.is_system() or exists (
    select 1 from platform.role_permissions rp
    where rp.permission = p and rp.role = any(app.roles())
  )
$$;

-- Field classification, read by the audit trigger for redaction
create table platform.column_classification (
  table_schema   text not null,
  table_name     text not null,
  column_name    text not null,
  classification text not null check (classification in ('public', 'sensitive', 'pii')),
  primary key (table_schema, table_name, column_name)
);

-- Audit log -------------------------------------------------------------------
create sequence platform.audit_log_seq;

create table platform.audit_log (
  id            uuid primary key,
  seq           bigint not null unique,
  occurred_at   timestamptz not null default now(),
  request_id    uuid not null,
  kind          text not null check (kind in ('action', 'row', 'auth', 'system')),
  app           text not null,
  actor_id      text,
  actor_email   text,
  actor_roles   text[],
  action        text,
  outcome       text check (outcome in ('success', 'denied', 'pending_approval', 'error')),
  resource_type text,
  resource_id   text,
  before        jsonb,
  after         jsonb,
  changed       text[],
  reason        text,
  metadata      jsonb,
  ip            text,
  user_agent    text,
  prev_hash     bytea,
  hash          bytea not null
);
create index audit_log_resource_idx on platform.audit_log (resource_type, resource_id);
create index audit_log_actor_idx on platform.audit_log (actor_id);
create index audit_log_request_idx on platform.audit_log (request_id);

-- Canonical text of a row for hashing (UTC timestamps, fixed key set)
create or replace function platform.audit_payload(a platform.audit_log) returns text language sql immutable as $$
  select jsonb_build_object(
    'id', a.id, 'seq', a.seq,
    'occurred_at', to_char(a.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'request_id', a.request_id, 'kind', a.kind, 'app', a.app,
    'actor_id', a.actor_id, 'actor_email', a.actor_email, 'actor_roles', a.actor_roles,
    'action', a.action, 'outcome', a.outcome,
    'resource_type', a.resource_type, 'resource_id', a.resource_id,
    'before', a.before, 'after', a.after, 'changed', a.changed,
    'reason', a.reason, 'metadata', a.metadata, 'ip', a.ip, 'user_agent', a.user_agent
  )::text
$$;

create or replace function platform.audit_chain() returns trigger
language plpgsql security definer set search_path = platform, pg_temp as $$
declare last_hash bytea;
begin
  -- Serialize writers so the chain follows commit order.
  perform pg_advisory_xact_lock(hashtext('platform.audit_log'));
  new.seq := nextval('platform.audit_log_seq');
  new.id := coalesce(new.id, platform.uuid_v7());
  new.occurred_at := coalesce(new.occurred_at, clock_timestamp());
  select l.hash into last_hash from platform.audit_log l order by l.seq desc limit 1;
  new.prev_hash := last_hash;
  new.hash := sha256(coalesce(last_hash, ''::bytea) || convert_to(platform.audit_payload(new), 'UTF8'));
  return new;
end $$;

create trigger audit_chain before insert on platform.audit_log
  for each row execute function platform.audit_chain();

create or replace function platform.audit_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'platform.audit_log is append-only (% blocked)', tg_op
    using errcode = 'insufficient_privilege';
end $$;

create trigger audit_no_update_delete before update or delete on platform.audit_log
  for each row execute function platform.audit_immutable();
create trigger audit_no_truncate before truncate on platform.audit_log
  for each statement execute function platform.audit_immutable();

create or replace function platform.verify_audit_chain()
returns table (ok boolean, checked bigint, broken_seq bigint, broken_id uuid)
language plpgsql stable security definer set search_path = platform, pg_temp as $$
declare r platform.audit_log; prev bytea := null; n bigint := 0;
begin
  for r in select * from platform.audit_log order by seq loop
    n := n + 1;
    if r.prev_hash is distinct from prev
       or r.hash <> sha256(coalesce(prev, ''::bytea) || convert_to(platform.audit_payload(r), 'UTF8')) then
      return query select false, n, r.seq, r.id;
      return;
    end if;
    prev := r.hash;
  end loop;
  return query select true, n, null::bigint, null::uuid;
end $$;

-- Row-change capture for tool tables (attached by platform.secure_table)
create or replace function platform.audit_row_change() returns trigger
language plpgsql security definer set search_path = platform, pg_temp as $$
declare
  b jsonb; a jsonb; ch text[]; redact text[]; k text;
begin
  select coalesce(array_agg(column_name), '{}') into redact
  from platform.column_classification
  where table_schema = tg_table_schema and table_name = tg_table_name and classification = 'pii';

  if tg_op in ('UPDATE', 'DELETE') then b := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then a := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(e.key order by e.key), '{}') into ch
    from jsonb_each(a) e where e.value is distinct from b -> e.key;
    if cardinality(ch) = 0 then return null; end if;
  end if;

  foreach k in array redact loop
    if b ? k and jsonb_typeof(b -> k) <> 'null' then b := jsonb_set(b, array[k], '"[redacted]"'); end if;
    if a ? k and jsonb_typeof(a -> k) <> 'null' then a := jsonb_set(a, array[k], '"[redacted]"'); end if;
  end loop;

  insert into platform.audit_log (request_id, kind, app, actor_id, actor_roles, action, outcome,
                                  resource_type, resource_id, before, after, changed)
  values (coalesce(app.request_id(), gen_random_uuid()), 'row', app.app_name(), app.user_id(), app.roles(),
          lower(tg_op), 'success', tg_table_schema || '.' || tg_table_name,
          coalesce(a ->> 'id', b ->> 'id'), b, a, ch);
  return null;
end $$;

-- Approvals -------------------------------------------------------------------
create table platform.approval_requests (
  id                  uuid primary key default platform.uuid_v7(),
  app                 text not null,
  action              text not null,
  approver_permission text not null,
  payload             jsonb not null,
  payload_hash        text not null,
  resource_type       text,
  resource_id         text,
  summary             text,
  requested_by        text not null,
  requested_by_email  text,
  status              text not null default 'pending'
    check (status in ('pending', 'approved', 'executed', 'rejected', 'expired', 'cancelled', 'failed')),
  approvals_required  int not null default 1 check (approvals_required >= 1),
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  decided_at          timestamptz,
  executed_at         timestamptz,
  result              jsonb,
  error               text
);
create index approval_requests_status_idx on platform.approval_requests (status, app);

create table platform.approval_decisions (
  id          uuid primary key default platform.uuid_v7(),
  request_id  uuid not null references platform.approval_requests(id),
  approver_id text not null,
  approver_email text,
  decision    text not null check (decision in ('approve', 'reject')),
  comment     text,
  decided_at  timestamptz not null default now(),
  unique (request_id, approver_id)
);

-- Only valid state transitions
create or replace function platform.approval_transition_guard() returns trigger language plpgsql as $$
begin
  if new.payload_hash <> old.payload_hash or new.payload <> old.payload then
    raise exception 'approval payload cannot change';
  end if;
  if old.status = new.status then return new; end if;
  if not ((old.status = 'pending'  and new.status in ('approved', 'rejected', 'expired', 'cancelled'))
       or (old.status = 'approved' and new.status in ('executed', 'failed'))) then
    raise exception 'invalid approval transition % -> %', old.status, new.status;
  end if;
  return new;
end $$;
create trigger approval_transition_guard before update on platform.approval_requests
  for each row execute function platform.approval_transition_guard();

-- Secure a tool table: RLS on, default deny, audit trigger, app_rw grants ------
create or replace function platform.secure_table(p_schema text, p_table text) returns void language plpgsql as $$
begin
  execute format('alter table %I.%I enable row level security', p_schema, p_table);
  execute format('drop trigger if exists audit_row_change on %I.%I', p_schema, p_table);
  execute format('create trigger audit_row_change after insert or update or delete on %I.%I
                  for each row execute function platform.audit_row_change()', p_schema, p_table);
  execute format('grant usage on schema %I to app_rw', p_schema);
  execute format('grant select, insert, update, delete on %I.%I to app_rw', p_schema, p_table);
end $$;

create or replace function platform.classify(p_schema text, p_table text, p_cols jsonb) returns void language sql as $$
  insert into platform.column_classification (table_schema, table_name, column_name, classification)
  select p_schema, p_table, key, value #>> '{}' from jsonb_each(p_cols)
  on conflict (table_schema, table_name, column_name) do update set classification = excluded.classification
$$;

-- Grants & RLS on platform tables ---------------------------------------------
grant usage on schema platform, app to app_rw;
grant execute on all functions in schema app to app_rw;

alter table platform.users enable row level security;
alter table platform.user_roles enable row level security;
alter table platform.auth_sessions_seen enable row level security;
alter table platform.role_permissions enable row level security;
alter table platform.column_classification enable row level security;
alter table platform.audit_log enable row level security;
alter table platform.approval_requests enable row level security;
alter table platform.approval_decisions enable row level security;

grant select, insert, update on platform.users to app_rw;
create policy users_read on platform.users for select using (app.user_id() is not null or app.is_system());
create policy users_write on platform.users for insert with check (id = app.user_id() or app.is_system());
create policy users_update on platform.users for update using (id = app.user_id() or app.is_system());

grant select, insert, delete on platform.user_roles to app_rw;
create policy roles_read on platform.user_roles for select
  using (user_id = app.user_id() or app.has_permission('platform:roles.manage')
         or app.has_permission('platform:audit.read') or app.is_system());
create policy roles_insert on platform.user_roles for insert
  with check (app.has_permission('platform:roles.manage') or app.is_system());
create policy roles_delete on platform.user_roles for delete
  using (app.has_permission('platform:roles.manage') or app.is_system());

grant select, insert on platform.auth_sessions_seen to app_rw;
create policy sessions_rw on platform.auth_sessions_seen for all
  using (user_id = app.user_id() or app.is_system()) with check (user_id = app.user_id() or app.is_system());

grant select on platform.role_permissions, platform.column_classification to app_rw;
create policy rp_read on platform.role_permissions for select using (true);
create policy cc_read on platform.column_classification for select using (true);

grant select, insert on platform.audit_log to app_rw;
create policy audit_insert on platform.audit_log for insert with check (true);
create policy audit_read on platform.audit_log for select
  using (app.user_id() is not null or app.is_system()); -- record-level access is enforced in the app layer

grant select, insert, update on platform.approval_requests to app_rw;
create policy ar_read on platform.approval_requests for select
  using (requested_by = app.user_id() or app.has_permission(approver_permission)
         or app.has_permission('platform:approvals.read_all') or app.is_system());
create policy ar_insert on platform.approval_requests for insert with check (requested_by = app.user_id());
create policy ar_update on platform.approval_requests for update
  using (requested_by = app.user_id() or app.has_permission(approver_permission) or app.is_system());

grant select, insert on platform.approval_decisions to app_rw;
create policy ad_read on platform.approval_decisions for select using (app.user_id() is not null);
create policy ad_insert on platform.approval_decisions for insert with check (approver_id = app.user_id());
