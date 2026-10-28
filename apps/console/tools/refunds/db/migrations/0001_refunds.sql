-- Refunds schema. Every table: platform.secure_table (RLS + audit trigger + grants),
-- explicit policies, and platform.classify for every column. CI fails otherwise.
create schema if not exists tool_refunds;

create table tool_refunds.refund_requests (
  id             uuid primary key default platform.uuid_v7(),
  customer_name  text not null,
  customer_email text not null,
  order_id       text not null,
  amount_cents   bigint not null check (amount_cents > 0 and amount_cents <= 10000000),
  reason         text not null,
  region         text not null check (region in ('US', 'EU', 'UK', 'APAC', 'LATAM')),
  status         text not null default 'requested'
    check (status in ('requested', 'pending_approval', 'issued', 'rejected')),
  reference      text unique check (reference ~ '^SIM-[A-Z0-9]{6}$'), -- simulated refund reference, no real payment
  requested_by   text not null,
  decided_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((status = 'issued') = (reference is not null))
);
create index refund_requests_status_idx on tool_refunds.refund_requests (status);
create index refund_requests_created_idx on tool_refunds.refund_requests (created_at desc);

select platform.secure_table('tool_refunds', 'refund_requests');
select platform.classify('tool_refunds', 'refund_requests', '{
  "id": "public", "customer_name": "pii", "customer_email": "pii", "order_id": "public",
  "amount_cents": "sensitive", "reason": "public", "region": "public", "status": "public",
  "reference": "public", "requested_by": "public", "decided_by": "public",
  "created_at": "public", "updated_at": "public"
}');

create policy refunds_read on tool_refunds.refund_requests for select
  using (app.has_permission('refunds:read'));

-- New requests start unissued; $500+ must start in pending_approval.
create policy refunds_insert on tool_refunds.refund_requests for insert
  with check (
    app.has_permission('refunds:request') and requested_by = app.user_id() and reference is null
    and status = case when amount_cents >= 50000 then 'pending_approval' else 'requested' end
  );

-- Requesters may only issue their own sub-$500 refunds; everything else needs an approver
-- (or the approval engine, which executes with platform_system).
create policy refunds_update on tool_refunds.refund_requests for update
  using (app.is_system() or app.has_permission('refunds:approve')
         or (app.has_permission('refunds:request') and requested_by = app.user_id()))
  with check (app.is_system() or app.has_permission('refunds:approve')
              or (app.has_permission('refunds:request') and requested_by = app.user_id() and amount_cents < 50000));

-- Demo seed: fake requesters and ~40 fake refund requests. No real customers or payments.
insert into platform.users (id, email, name) values
  ('seed-agent-1', 'maya.seed@demo.internal', 'Maya (seed data)'),
  ('seed-agent-2', 'tom.seed@demo.internal', 'Tom (seed data)')
on conflict (id) do nothing;
insert into platform.user_roles (user_id, role, granted_by) values
  ('seed-agent-1', 'support_agent', 'seed'), ('seed-agent-2', 'support_agent', 'seed')
on conflict do nothing;

with s as (
  select i,
    (array['issued','issued','issued','issued','issued','pending_approval','pending_approval','rejected','rejected','requested'])[i % 10 + 1] as status,
    (array['Avery','Jordan','Riley','Casey','Morgan','Quinn','Harper','Rowan'])[i % 8 + 1] as first,
    (array['Testwell','Sampleton','Mockford','Fakely','Demoson'])[i % 5 + 1] as last
  from generate_series(1, 40) i
)
insert into tool_refunds.refund_requests
  (customer_name, customer_email, order_id, amount_cents, reason, region, status, reference, requested_by, decided_by, created_at, updated_at)
select
  first || ' ' || last,
  lower(first || '.' || last || i) || '@example.com',
  'ORD-' || (100000 + i * 137),
  case status
    when 'pending_approval' then 50000 + (i * 3571) % 150000
    when 'rejected' then 50000 + (i * 2741) % 100000
    when 'requested' then 1500 + (i * 7919) % 45000
    else 1500 + (i * 7919) % 90000
  end,
  (array['Item arrived damaged','Duplicate charge','Order never delivered','Wrong item shipped','Subscription cancelled','Service outage credit'])[i % 6 + 1],
  (array['US','EU','UK','APAC','LATAM'])[i % 5 + 1],
  status,
  case when status = 'issued' then 'SIM-' || upper(substr(md5('seed-refund-' || i), 1, 6)) end,
  'seed-agent-' || (i % 2 + 1),
  case when status = 'rejected' then 'finance.seed@demo.internal' end,
  now() - make_interval(hours => i * 35),
  now() - make_interval(hours => i * 35) + case when status in ('issued', 'rejected') then interval '6 hours' else interval '0' end
from s;

-- Seeded pending refunds get real approval requests (payload {"id"}; hash = sha256 of its canonical JSON)
-- so approvers can act on them in the inbox.
insert into platform.approval_requests
  (app, action, approver_permission, payload, payload_hash, resource_type, resource_id, summary,
   requested_by, requested_by_email, created_at, expires_at)
select 'refunds', 'refunds.issue', 'refunds:approve',
  jsonb_build_object('id', r.id::text),
  encode(sha256(convert_to('{"id":"' || r.id::text || '"}', 'UTF8')), 'hex'),
  'tool_refunds.refund_requests', r.id::text,
  'Refund $' || to_char(r.amount_cents / 100.0, 'FM999990.00') || ' for order ' || r.order_id,
  r.requested_by, u.email, r.created_at, now() + interval '365 days'
from tool_refunds.refund_requests r join platform.users u on u.id = r.requested_by
where r.status = 'pending_approval';
