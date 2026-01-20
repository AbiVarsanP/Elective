-- Lock down direct inserts into `elective_registrations` to force usage of RPC/backend
-- Run this as a DB admin (Supabase SQL editor) after ensuring your RPC function exists and is SECURITY DEFINER.

-- 1) Enable row level security on the registrations table (if not already enabled)
ALTER TABLE public.elective_registrations ENABLE ROW LEVEL SECURITY;

-- 2) Revoke direct INSERT privileges from the `authenticated` and `anonymous` roles (adjust roles as needed)
REVOKE INSERT ON public.elective_registrations FROM public;
REVOKE INSERT ON public.elective_registrations FROM authenticated;
REVOKE INSERT ON public.elective_registrations FROM anon;

-- 3) Create a restrictive policy that denies direct inserts by default
DROP POLICY IF EXISTS disallow_direct_insert ON public.elective_registrations;
CREATE POLICY disallow_direct_insert
  ON public.elective_registrations
  FOR INSERT
  USING (false)
  WITH CHECK (false);

-- Note: Because the RPC function is created with SECURITY DEFINER and owned by a privileged role,
-- calling the function will still be able to insert into `elective_registrations` even though
-- direct inserts are blocked by the policy.

-- Optional: audit table for registrations inserted via RPC
CREATE TABLE IF NOT EXISTS public.elective_registration_audit (
  id bigserial primary key,
  registration_id uuid,
  elective_id uuid,
  student_id uuid,
  created_at timestamptz default now(),
  note text
);

-- You can modify the RPC function to INSERT into the audit table when a registration occurs.
