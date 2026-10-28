-- __TITLE__ schema. Every table: platform.secure_table (RLS + audit trigger + grants),
-- explicit policies, and platform.classify for every column. CI fails otherwise.
create schema if not exists __SCHEMA__;

create table __SCHEMA__.items (
  id             uuid primary key default platform.uuid_v7(),
  title          text not null,
  customer_email text not null,
  amount_cents   bigint not null default 0 check (amount_cents >= 0),
  status         text not null default 'open' check (status in ('open', 'in_progress', 'closed')),
  region         text not null default 'US',
  owner_id       text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

select platform.secure_table('__SCHEMA__', 'items');
select platform.classify('__SCHEMA__', 'items', '{
  "id": "public", "title": "public", "customer_email": "pii", "amount_cents": "sensitive",
  "status": "public", "region": "public", "owner_id": "public", "created_at": "public", "updated_at": "public"
}');

create policy items_read on __SCHEMA__.items for select using (app.has_permission('__TOOL__:read'));
create policy items_insert on __SCHEMA__.items for insert
  with check (app.has_permission('__TOOL__:create') and owner_id = app.user_id());
create policy items_update on __SCHEMA__.items for update
  using (app.has_permission('__TOOL__:update') or app.is_system());
