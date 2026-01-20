Backend notes

- Uses `SUPABASE_JWT_SECRET` to verify access tokens posted by client (do NOT expose this secret client-side).
- Uses `SUPABASE_SERVICE_ROLE_KEY` to query DB (only server).
- Role-guard middlewares: `requireAdmin`, `requireStaff`, `requireStudent`.

Security
- Frontend uses anon key only, backend uses service key.
- Role is read from JWT payload (`user_metadata.role`) and enforced on backend endpoints.
