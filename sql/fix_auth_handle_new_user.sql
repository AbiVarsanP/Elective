-- Compatibility fix: create a no-op trigger function
-- This prevents the `on_auth_user_created` trigger from failing when the original
-- `handle_new_user` function is missing or expects different column names.
-- Run this in the Supabase SQL editor (Project > SQL) or via psql as a project owner.

CREATE OR REPLACE FUNCTION auth.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Minimal compatibility implementation:
  -- simply return the NEW row so user creation proceeds.
  -- If you need the original behavior, replace this body with the original
  -- function logic (which may migrate fields like raw_user_meta -> raw_user_meta_data).
  RETURN NEW;
END;
$$;

-- After running the above, try creating a user again via the Admin REST API
-- or via the Supabase Console Authentication UI to verify the error is resolved.
