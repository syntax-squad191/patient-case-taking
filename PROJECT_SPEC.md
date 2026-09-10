# PRAKRITI — Case Taking Software

## 1. Project Purpose

This is a Smart India Hackathon project for structured patient case-taking for AYUSH healthcare workflows.

The application has three roles:

* Patient
* Doctor
* Pharmacist

The project must remain one integrated application.

## 2. Technology Stack

* Frontend: React / Next.js / TypeScript
* Styling: existing project styling system
* Backend: existing React/Next.js backend/API structure
* Database: Supabase PostgreSQL
* Authentication: Supabase Auth where applicable
* Deployment: Vercel
* Repository: GitHub

Do not replace the existing stack unless the team explicitly decides to do so.

## 3. Team Development Rules

All agents work inside the same GitHub repository and the same Supabase project.

Agents MUST:

* inspect existing code before creating new code
* reuse existing components and utilities
* reuse existing database tables and fields
* reuse existing API routes when possible
* follow the existing project structure
* keep their changes limited to their assigned module
* avoid unnecessary changes to other modules
* use TypeScript where the project already uses TypeScript
* make changes that can be merged with other team members' branches

Agents MUST NOT:

* create another Supabase project
* create another database
* create a separate authentication system
* duplicate an existing feature
* rename database fields without team approval
* change the technology stack
* hard-code secrets or API keys
* commit `.env` or `.env.local`
* overwrite another module unnecessarily

## 4. Source of Truth

Before implementing anything, inspect:

1. `PROJECT_SPEC.md`
2. `supabase/schema.sql`
3. `package.json`
4. existing source code
5. existing components and API routes related to the assigned task

The existing codebase is the source of truth.

Do not assume that a feature does not exist until the repository has been inspected.

## 5. Application Flow

### Patient

Patient → Login → Patient Profile → Case-Taking Chatbot → Case Submitted → Doctor Reviews Case

### Doctor

Doctor → Verification/Login → Dashboard → Search Patient ID → Review Patient Case → Verify Patient → Create Prescription

### Pharmacist

Pharmacist → Verification/Login → Search Patient ID / Access Code → View Prescription → Process Prescription

## 6. Patient Case

The chatbot collects:

### General Information

* Name
* Weight
* Present history
* Past medical history
* Previous surgeries
* Current medications
* Other relevant doctor-useful information

### AYUSH Information

The patient first selects the AYUSH system:

* Ayurveda
* Yoga
* Naturopathy
* Unani
* Siddha
* Homeopathy

The chatbot then asks only the relevant questions for the selected system.

Questions should be useful for clinical case-taking and should not become unnecessarily long or repetitive.

## 7. Doctor Workflow

A doctor must be able to:

* access a patient using Patient ID
* view submitted patient information
* view the patient's case history
* review the chatbot responses
* view the generated case summary
* verify/accept the patient case
* create a prescription after patient verification

A prescription must be issued digitally through the application.

## 8. Pharmacist Workflow

A pharmacist must be able to:

* verify their pharmacy identity
* search/access a patient using the approved Patient ID workflow
* view the prescription associated with that patient
* see the Doctor ID
* see prescription date/time/year
* process the prescription

Any temporary access code should be single-use and invalidated after use.

## 9. Verification

Doctor verification and pharmacist verification must use the verification system implemented by the project.

For doctor identity/liveness verification:

* liveness should verify that the camera is seeing a real person
* after successful liveness verification, capture the verification snapshot
* compare the snapshot with the submitted identity-photo source
* after verification is completed, the submitted identity document image must not be retained unnecessarily

If an external registry such as NMC is unavailable or times out, do NOT silently approve the user using a fake/sandbox result in production.

Instead, show an appropriate verification-unavailable message and allow the user to try again later.

## 10. Database Rules

The database schema is defined in:

`supabase/schema.sql`

Agents must inspect this file before creating or modifying database-related code.

Do not create duplicate tables for the same purpose.

Important entities include:

* profiles
* patients
* doctors
* pharmacists
* patient_cases
* prescriptions

Use the existing IDs and relationships defined by the schema.

## 11. Security

Never expose:

* Supabase service-role keys
* private API keys
* secrets
* authentication credentials

Frontend code may use the public Supabase client configuration intended for browser use.

Sensitive operations must be handled server-side when required.

Patient and prescription information must not be exposed publicly.

## 12. Module Ownership

### Patient Module

Responsible for:

* patient login
* patient profile
* case-taking chatbot
* AYUSH questions
* case submission

### Doctor Module

Responsible for:

* doctor verification
* doctor dashboard
* patient lookup
* patient case review
* patient verification
* prescription creation

### Pharmacist Module

Responsible for:

* pharmacist verification
* patient lookup
* prescription access
* prescription processing
* one-time access workflow

### Shared Infrastructure

Responsible for:

* Supabase client
* database types
* shared components
* API utilities
* authentication utilities
* common UI components

## 13. Agent Workflow

Before coding:

1. Read `PROJECT_SPEC.md`.
2. Inspect the existing repository.
3. Inspect the relevant database schema.
4. Find existing implementations that can be reused.
5. Identify the smallest set of files that need modification.
6. Implement the assigned feature.
7. Test the feature.
8. Check for TypeScript/build/lint errors.
9. Explain what files were changed and why.

Do not rebuild the application from scratch.

## 14. Integration Rule

Modules communicate through shared application interfaces, APIs, and the Supabase database.

Do not create hidden dependencies between modules.

For example:

Patient chatbot → saves case → `patient_cases`

Doctor dashboard → reads `patient_cases`

Doctor → verifies patient → creates prescription

Pharmacist → accesses prescription through the approved workflow

The chatbot should not directly modify the doctor's dashboard UI.

The pharmacist module should not directly depend on the chatbot implementation.

## 15. Changes to Shared Files

Before modifying a shared file such as:

* `package.json`
* database schema
* authentication logic
* global layout
* shared types
* shared API utilities

inspect how other modules use it.

Make the smallest compatible change possible.

If a change could affect another module, explicitly mention it in the final response.

## 16. Definition of Done

A feature is not considered complete until:

* it works with the existing application
* it uses the existing Supabase project
* it follows the existing database schema
* it does not duplicate existing functionality
* it does not introduce unnecessary dependencies
* TypeScript/build errors are resolved
* the implementation is ready to merge into the shared repository
