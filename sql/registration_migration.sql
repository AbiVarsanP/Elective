-- Migration: create elective_registrations table and register_elective function

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- registrations table
CREATE TABLE IF NOT EXISTS public.elective_registrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  elective_id uuid NOT NULL REFERENCES public.electives(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (elective_id, student_id)
);

-- Function: register_elective(student_user_id uuid, elective_id uuid)
-- Returns a single row: success boolean, message text, filled_seats int, total_seats int, registered boolean
CREATE OR REPLACE FUNCTION public.register_elective(p_student_user_id uuid, p_elective_id uuid)
RETURNS TABLE(success boolean, message text, filled_seats int, total_seats int, registered boolean) AS $$
DECLARE
  v_student_id uuid;
  v_total int;
  v_filled int;
BEGIN
  -- resolve student id
  SELECT public.students.id INTO v_student_id FROM public.students WHERE public.students.user_id = p_student_user_id LIMIT 1;
  IF v_student_id IS NULL THEN
    success := false; message := 'student profile not found'; filled_seats := NULL; total_seats := NULL; registered := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- lock elective row
  SELECT public.electives.total_seats, public.electives.filled_seats INTO v_total, v_filled FROM public.electives WHERE public.electives.id = p_elective_id FOR UPDATE;
  IF v_total IS NULL THEN
    success := false; message := 'elective not found'; filled_seats := NULL; total_seats := NULL; registered := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- already full
  IF v_filled >= v_total THEN
    success := false; message := 'no seats available'; filled_seats := v_filled; total_seats := v_total; registered := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- already registered
  IF EXISTS(SELECT 1 FROM public.elective_registrations WHERE elective_id = p_elective_id AND student_id = v_student_id) THEN

      -- check if student already registered for any elective
      IF EXISTS(SELECT 1 FROM public.elective_registrations er WHERE er.student_id = v_student_id) THEN
        -- if already registered for same elective, report already registered; otherwise block
        IF EXISTS(SELECT 1 FROM public.elective_registrations er2 WHERE er2.student_id = v_student_id AND er2.elective_id = p_elective_id) THEN
          success := true; message := 'already registered'; filled_seats := v_filled; total_seats := v_total; registered := true;
          RETURN NEXT; RETURN;
        ELSE
          success := false; message := 'already registered for another elective'; filled_seats := v_filled; total_seats := v_total; registered := false;
          RETURN NEXT; RETURN;
        END IF;
      END IF;
    success := true; message := 'already registered'; filled_seats := v_filled; total_seats := v_total; registered := true;
    RETURN NEXT;
    RETURN;
  END IF;

  -- insert registration and increment filled seats
  INSERT INTO public.elective_registrations (elective_id, student_id) VALUES (p_elective_id, v_student_id);
  -- use table alias to reference columns in UPDATE to avoid qualification parsing issues
  UPDATE public.electives e SET filled_seats = e.filled_seats + 1 WHERE e.id = p_elective_id;

  -- return updated counts
  SELECT e.filled_seats INTO v_filled FROM public.electives e WHERE e.id = p_elective_id;
  success := true; message := 'registered'; filled_seats := v_filled; total_seats := v_total; registered := true;
  RETURN NEXT;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
