-- Migration: migrate electives to use parent_elective_id
BEGIN;

-- Ensure parent_electives exists (safe to run multiple times)
CREATE TABLE IF NOT EXISTS public.parent_electives (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year integer,
  sem integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Add parent_elective_id to electives
ALTER TABLE IF EXISTS public.electives
  ADD COLUMN IF NOT EXISTS parent_elective_id uuid;

-- Insert parent_electives for each distinct parent_code/year/semester combination
INSERT INTO public.parent_electives (id, name, year, sem, created_at)
SELECT gen_random_uuid(), s.parent_code, s.year, s.semester, now()
FROM (
  SELECT DISTINCT parent_code, year, semester
  FROM public.electives
  WHERE parent_code IS NOT NULL
) s
WHERE NOT EXISTS (
  SELECT 1 FROM public.parent_electives p WHERE p.name = s.parent_code AND p.year = s.year AND p.sem = s.semester
);

-- Link electives to the created parent_electives
UPDATE public.electives e
SET parent_elective_id = p.id
FROM public.parent_electives p
WHERE e.parent_code = p.name
  AND e.year = p.year
  AND e.semester = p.sem;

-- Add FK constraint (Postgres doesn't support ADD CONSTRAINT IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_electives_parent'
  ) THEN
    EXECUTE 'ALTER TABLE public.electives ADD CONSTRAINT fk_electives_parent FOREIGN KEY (parent_elective_id) REFERENCES public.parent_electives(id) ON DELETE SET NULL';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_electives_parent_id ON public.electives (parent_elective_id);

-- Drop old columns now that we have parent_elective_id
ALTER TABLE IF EXISTS public.electives
  DROP COLUMN IF EXISTS parent_code,
  DROP COLUMN IF EXISTS year,
  DROP COLUMN IF EXISTS semester;

COMMIT;
