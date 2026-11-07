-- Imuni Clinical DB v1
-- Classification: clinical_sensitive
-- Mode: staging/dev first. Production writes remain blocked until R5 approval.
-- This schema intentionally avoids storing raw clinical narrative in audit logs.

create extension if not exists pgcrypto;
create schema if not exists imuni;
create schema if not exists imuni_audit;

create table if not exists imuni.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now()
);

create table if not exists imuni.practitioners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imuni.tenants(id),
  name text not null,
  crm text,
  crm_uf char(2),
  role text not null default 'physician',
  email_hash text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, crm, crm_uf)
);

create table if not exists imuni.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imuni.tenants(id),
  patient_code text not null,
  full_name_encrypted text not null,
  cpf_hash text,
  birth_date_encrypted text,
  phone_encrypted text,
  phone_hash text,
  email_encrypted text,
  email_hash text,
  emergency_contact_encrypted text,
  status text not null default 'active' check (status in ('active','archived','restricted')),
  created_by uuid references imuni.practitioners(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (tenant_id, patient_code)
);

create index if not exists idx_imuni_patients_tenant_status
  on imuni.patients (tenant_id, status);

create index if not exists idx_imuni_patients_cpf_hash
  on imuni.patients (tenant_id, cpf_hash)
  where cpf_hash is not null;

create table if not exists imuni.patient_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imuni.tenants(id),
  patient_id uuid not null references imuni.patients(id),
  consent_type text not null,
  version text not null,
  status text not null check (status in ('draft','given','revoked','expired')),
  legal_basis text,
  evidence_ref text,
  given_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references imuni.practitioners(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_imuni_consents_patient
  on imuni.patient_consents (patient_id, status, consent_type);

create table if not exists imuni.access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imuni.tenants(id),
  practitioner_id uuid not null references imuni.practitioners(id),
  patient_id uuid not null references imuni.patients(id),
  scope text not null check (scope in ('read','write','admin','emergency')),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  reason text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, practitioner_id, patient_id, scope)
);

create table if not exists imuni.encounters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imuni.tenants(id),
  patient_id uuid not null references imuni.patients(id),
  practitioner_id uuid not null references imuni.practitioners(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  encounter_type text not null default 'consultation',
  status text not null default 'draft' check (status in ('draft','signed','amended','voided')),
  chief_complaint_encrypted text,
  subjective_encrypted text,
  objective_encrypted text,
  assessment_encrypted text,
  plan_encrypted text,
  red_flags_summary_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  signed_at timestamptz,
  locked_at timestamptz
);

create index if not exists idx_imuni_encounters_patient_started
  on imuni.encounters (patient_id, started_at desc);

create index if not exists idx_imuni_encounters_practitioner_started
  on imuni.encounters (practitioner_id, started_at desc);

create table if not exists imuni.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imuni.tenants(id),
  encounter_id uuid not null references imuni.encounters(id),
  author_id uuid not null references imuni.practitioners(id),
  note_type text not null default 'progress',
  body_encrypted text not null,
  created_at timestamptz not null default now(),
  amended_from_note_id uuid references imuni.clinical_notes(id)
);

create index if not exists idx_imuni_notes_encounter
  on imuni.clinical_notes (encounter_id, created_at);

create table if not exists imuni.attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imuni.tenants(id),
  patient_id uuid not null references imuni.patients(id),
  encounter_id uuid references imuni.encounters(id),
  storage_uri text not null,
  mime text not null,
  sha256 text not null,
  label text,
  uploaded_by uuid references imuni.practitioners(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, sha256)
);

create table if not exists imuni_audit.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references imuni.tenants(id),
  actor_id uuid,
  actor_role text,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  patient_id_hash text,
  ip_hash text,
  user_agent_hash text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint no_raw_clinical_payload check (
    metadata_json ? 'raw_clinical_text' = false
    and metadata_json ? 'subjective' = false
    and metadata_json ? 'objective' = false
    and metadata_json ? 'assessment' = false
    and metadata_json ? 'plan' = false
  )
);

create index if not exists idx_imuni_audit_resource
  on imuni_audit.events (resource_type, resource_id, created_at desc);

create index if not exists idx_imuni_audit_patient_hash
  on imuni_audit.events (patient_id_hash, created_at desc);

-- Row-level security is enabled now; policies must be bound to app roles in a later migration.
alter table imuni.tenants enable row level security;
alter table imuni.practitioners enable row level security;
alter table imuni.patients enable row level security;
alter table imuni.patient_consents enable row level security;
alter table imuni.access_grants enable row level security;
alter table imuni.encounters enable row level security;
alter table imuni.clinical_notes enable row level security;
alter table imuni.attachments enable row level security;
alter table imuni_audit.events enable row level security;
