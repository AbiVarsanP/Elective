-- Migration: create parent_electives table
CREATE TABLE IF NOT EXISTS public.parent_electives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year integer,
  sem integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Optional: add an index on year/sem for quick lookups
CREATE INDEX IF NOT EXISTS idx_parent_electives_year_sem ON public.parent_electives (year, sem);
