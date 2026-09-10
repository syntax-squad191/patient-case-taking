-- ============================================================
-- PRAKRITI — CASE TAKING SOFTWARE
-- FINAL DATABASE SCHEMA
-- ============================================================

create extension if not exists "pgcrypto";


-- ============================================================
-- PROFILES
-- Basic account information for every authenticated user
-- Email is handled by Supabase Auth (auth.users)
-- ============================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,

    role text not null check (
        role in ('patient', 'doctor', 'pharmacist')
    ),

    full_name text,
    phone text,

    created_at timestamptz not null default now()
);


-- ============================================================
-- PATIENTS
-- ============================================================

create table if not exists public.patients (
    id uuid primary key default gen_random_uuid(),

    profile_id uuid unique
        references public.profiles(id)
        on delete cascade,

    full_name text not null,
    date_of_birth date,

    -- Doctor verification of the patient's submitted case
    verified boolean not null default false,

    created_at timestamptz not null default now()
);


-- ============================================================
-- DOCTORS
-- ============================================================

create table if not exists public.doctors (
    id uuid primary key default gen_random_uuid(),

    profile_id uuid unique
        references public.profiles(id)
        on delete cascade,

    registration_number text unique not null,
    full_name text not null,

    verification_status text not null default 'pending'
        check (
            verification_status in (
                'pending',
                'verified',
                'rejected',
                'unavailable'
            )
        ),

    verification_source text,

    created_at timestamptz not null default now()
);


-- ============================================================
-- PHARMACISTS
-- ============================================================

create table if not exists public.pharmacists (
    id uuid primary key default gen_random_uuid(),

    profile_id uuid unique
        references public.profiles(id)
        on delete cascade,

    registration_number text unique not null,
    pharmacy_name text not null,

    verification_status text not null default 'pending'
        check (
            verification_status in (
                'pending',
                'verified',
                'rejected',
                'unavailable'
            )
        ),

    created_at timestamptz not null default now()
);


-- ============================================================
-- PATIENT CASES
-- Stores chatbot answers and AI-generated summary
-- ============================================================

create table if not exists public.patient_cases (
    id uuid primary key default gen_random_uuid(),

    patient_id uuid not null
        references public.patients(id)
        on delete cascade,

    ayush_system text not null
        check (
            ayush_system in (
                'Ayurveda',
                'Yoga',
                'Naturopathy',
                'Unani',
                'Siddha',
                'Homeopathy'
            )
        ),

    -- All chatbot responses
    answers jsonb not null default '{}'::jsonb,

    -- AI-generated doctor-friendly summary
    summary text,

    status text not null default 'submitted'
        check (
            status in (
                'draft',
                'submitted',
                'under_review',
                'verified',
                'rejected'
            )
        ),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);


-- ============================================================
-- PRESCRIPTIONS
-- ============================================================

create table if not exists public.prescriptions (
    id uuid primary key default gen_random_uuid(),

    patient_id uuid not null
        references public.patients(id)
        on delete cascade,

    doctor_id uuid not null
        references public.doctors(id)
        on delete restrict,

    patient_case_id uuid
        references public.patient_cases(id)
        on delete set null,

    -- Medicines, dosage, frequency, duration, etc.
    medicines jsonb not null default '[]'::jsonb,

    instructions text,

    -- Temporary pharmacist access
    -- Store only the HASH of the access code
    access_code_hash text,

    -- Prevent the temporary code from being reused
    access_used boolean not null default false,

    -- Optional expiration time
    access_expires_at timestamptz,

    -- When the pharmacist used the code
    used_at timestamptz,

    -- Prescription creation time
    issued_at timestamptz not null default now()
);


-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_patient_cases_patient_id
on public.patient_cases(patient_id);

create index if not exists idx_patient_cases_status
on public.patient_cases(status);

create index if not exists idx_prescriptions_patient_id
on public.prescriptions(patient_id);

create index if not exists idx_prescriptions_doctor_id
on public.prescriptions(doctor_id);

create index if not exists idx_prescriptions_patient_case_id
on public.prescriptions(patient_case_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.doctors enable row level security;
alter table public.pharmacists enable row level security;
alter table public.patient_cases enable row level security;
alter table public.prescriptions enable row level security;


-- ============================================================
-- PROFILE POLICIES
-- ============================================================

create policy "Users can view their own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles
for update
using (auth.uid() = id);


-- ============================================================
-- PATIENT POLICIES
-- ============================================================

create policy "Patients can view their own record"
on public.patients
for select
using (profile_id = auth.uid());

create policy "Patients can create their own record"
on public.patients
for insert
with check (profile_id = auth.uid());

create policy "Patients can update their own record"
on public.patients
for update
using (profile_id = auth.uid());


-- ============================================================
-- DOCTOR POLICIES
-- ============================================================

create policy "Doctors can view their own record"
on public.doctors
for select
using (profile_id = auth.uid());

create policy "Doctors can create their own record"
on public.doctors
for insert
with check (profile_id = auth.uid());


-- ============================================================
-- PHARMACIST POLICIES
-- ============================================================

create policy "Pharmacists can view their own record"
on public.pharmacists
for select
using (profile_id = auth.uid());

create policy "Pharmacists can create their own record"
on public.pharmacists
for insert
with check (profile_id = auth.uid());


-- ============================================================
-- PATIENT CASE POLICIES
-- ============================================================

create policy "Patients can view their own cases"
on public.patient_cases
for select
using (
    patient_id in (
        select id
        from public.patients
        where profile_id = auth.uid()
    )
);

create policy "Patients can create their own cases"
on public.patient_cases
for insert
with check (
    patient_id in (
        select id
        from public.patients
        where profile_id = auth.uid()
    )
);

create policy "Patients can update their own cases"
on public.patient_cases
for update
using (
    patient_id in (
        select id
        from public.patients
        where profile_id = auth.uid()
    )
);


-- ============================================================
-- PRESCRIPTION POLICIES
-- ============================================================

create policy "Doctors can view their own prescriptions"
on public.prescriptions
for select
using (
    doctor_id in (
        select id
        from public.doctors
        where profile_id = auth.uid()
    )
);

create policy "Doctors can create prescriptions"
on public.prescriptions
for insert
with check (
    doctor_id in (
        select id
        from public.doctors
        where profile_id = auth.uid()
    )
);


-- ============================================================
-- UPDATED_AT TRIGGER
-- Automatically updates patient_cases.updated_at
-- ============================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists patient_cases_updated_at
on public.patient_cases;

create trigger patient_cases_updated_at
before update on public.patient_cases
for each row
execute function public.update_updated_at();