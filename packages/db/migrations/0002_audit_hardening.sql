-- Audit rows are readable by auditors/admins, by the actor themselves, and (for approval
-- events) by anyone who can see the approval request. Previously any signed-in user could read all.
drop policy if exists audit_read on platform.audit_log;
create policy audit_read on platform.audit_log for select
  using (
    app.is_system()
    or app.has_permission('platform:audit.read')
    or actor_id = app.user_id()
    or (resource_type = 'platform.approval_request'
        and exists (select 1 from platform.approval_requests r where r.id::text = audit_log.resource_id))
  );

-- Record rejected input (validation failures) as their own outcome.
alter table platform.audit_log drop constraint if exists audit_log_outcome_check;
alter table platform.audit_log add constraint audit_log_outcome_check
  check (outcome in ('success', 'denied', 'invalid', 'pending_approval', 'error'));
