-- SQL: safe RPC to atomically check seats and register a student
-- Usage: CALL or SELECT from RPC via Supabase `rpc('select_elective', ...)` with service role key

-- This function assumes these tables (adjust names/columns if different):
-- - electives(id uuid primary key, total_seats int, filled_seats int)
-- - registrations(id uuid primary key default gen_random_uuid(), elective_id uuid references electives(id), student_id uuid references students(id), created_at timestamptz default now())

-- Replace table/column names as appropriate for your schema.

CREATE OR REPLACE FUNCTION public.select_elective(
  p_elective_id uuid,
  p_student_id uuid
 ) RETURNS TABLE(success boolean, message text, registration_id uuid)
  LANGUAGE plpgsql
  SECURITY DEFINER
  -- it's recommended to run this as the DB owner (postgres) or via the Supabase SQL editor
  AS $$
DECLARE
  v_total int;
  v_filled int;
  v_reg_id uuid;
BEGIN
  -- Lock the elective row to prevent concurrent modifications
  SELECT total_seats, filled_seats INTO v_total, v_filled
  FROM public.electives
  WHERE id = p_elective_id
  FOR UPDATE;

  IF NOT FOUND THEN
    success := false;
    message := 'Elective not found';
    registration_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_filled >= v_total THEN
    success := false;
    message := 'No seats available';
    registration_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Optional: check if student already registered
  IF EXISTS(SELECT 1 FROM public.registrations WHERE elective_id = p_elective_id AND student_id = p_student_id) THEN
    success := false;
    message := 'Student already registered in this elective';
    registration_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Insert registration and increment filled_seats in same transaction
  INSERT INTO public.registrations (elective_id, student_id) VALUES (p_elective_id, p_student_id) RETURNING id INTO v_reg_id;

  UPDATE public.electives SET filled_seats = filled_seats + 1 WHERE id = p_elective_id;

  success := true;
  message := 'Registered';
  registration_id := v_reg_id;
  RETURN NEXT;
  RETURN;
EXCEPTION WHEN others THEN
  -- On unexpected error, raise for caller or return failure
  success := false;
  message := SQLERRM;
  registration_id := NULL;
  RETURN NEXT;
  RETURN;
END;
$$;

-- Grant execute to service role is unnecessary when calling via Supabase with service_role_key,
-- but you may want to restrict usage via row-level security or policies.

-- Example RPC call via supabase-js (server):
-- const { data, error } = await supabase.rpc('select_elective', { p_elective_id: '<uuid>', p_student_id: '<uuid>' })
-- data will be an array of rows with (success, message, registration_id)
