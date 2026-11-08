
-- Imuni R5 app-role RLS policies for real patient writes.
-- This migration is intentionally idempotent and uses custom GUCs set by tools:
--   imuni.tenant_id
--   imuni.practitioner_id

alter table imuni.tenants force row level security;
alter table imuni.practitioners force row level security;
alter table imuni.patients force row level security;
alter table imuni.patient_consents force row level security;
alter table imuni.access_grants force row level security;
alter table imuni.encounters force row level security;
alter table imuni.clinical_notes force row level security;
alter table imuni.attachments force row level security;
alter table imuni_audit.events force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='imuni' and tablename='tenants' and policyname='imuni_app_tenant_scope') then
    create policy imuni_app_tenant_scope on imuni.tenants
      for all to imuni_app
      using (id = nullif(current_setting('imuni.tenant_id', true), '')::uuid)
      with check (id = nullif(current_setting('imuni.tenant_id', true), '')::uuid);
  end if;

  if not exists (select 1 from pg_policies where schemaname='imuni' and tablename='practitioners' and policyname='imuni_app_practitioner_scope') then
    create policy imuni_app_practitioner_scope on imuni.practitioners
      for all to imuni_app
      using (
        tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
        and id = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
      )
      with check (
        tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
        and id = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='imuni' and tablename='patients' and policyname='imuni_app_patient_insert_by_active_practitioner') then
    create policy imuni_app_patient_insert_by_active_practitioner on imuni.patients
      for insert to imuni_app
      with check (
        tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
        and created_by = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
        and exists (
          select 1 from imuni.practitioners p
          where p.id = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
            and p.tenant_id = patients.tenant_id
            and p.status = 'active'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='imuni' and tablename='patients' and policyname='imuni_app_patient_access_grant_scope') then
    create policy imuni_app_patient_access_grant_scope on imuni.patients
      for select to imuni_app
      using (
        tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
        and exists (
          select 1 from imuni.access_grants g
          where g.tenant_id = patients.tenant_id
            and g.patient_id = patients.id
            and g.practitioner_id = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
            and g.status = 'active'
            and g.scope in ('read','write','admin','emergency')
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='imuni' and tablename='access_grants' and policyname='imuni_app_access_grant_insert_self_admin') then
    create policy imuni_app_access_grant_insert_self_admin on imuni.access_grants
      for insert to imuni_app
      with check (
        tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
        and practitioner_id = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
        and scope = 'admin'
        and status = 'active'
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='imuni' and tablename='access_grants' and policyname='imuni_app_access_grant_read_scope') then
    create policy imuni_app_access_grant_read_scope on imuni.access_grants
      for select to imuni_app
      using (
        tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
        and practitioner_id = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='imuni_audit' and tablename='events' and policyname='imuni_app_audit_insert_same_tenant') then
    create policy imuni_app_audit_insert_same_tenant on imuni_audit.events
      for insert to imuni_app
      with check (
        tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
        and actor_id = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='imuni_audit' and tablename='events' and policyname='imuni_app_audit_read_same_actor') then
    create policy imuni_app_audit_read_same_actor on imuni_audit.events
      for select to imuni_app
      using (
        tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
        and actor_id = nullif(current_setting('imuni.practitioner_id', true), '')::uuid
      );
  end if;
end $$;
