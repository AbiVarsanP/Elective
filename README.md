# Elective Login System

Stack
- Frontend: React + TypeScript (Vite)
- Backend: Node.js + Express (TypeScript)
- Auth & DB: Supabase

Overview
- Frontend uses Supabase Auth (anon key) for login.
- Role is read from JWT / session user metadata and used for redirection only; Frontend never sets role.
- Backend verifies JWT using `SUPABASE_JWT_SECRET` and uses service role key for DB queries.

Quick start (dev)

1) Fill env files:
- `frontend/.env` (Vite env): set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `backend/.env`: set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `PORT`.

2) Install & run (each folder):

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Backend:
```bash
cd backend
npm install
npm run dev
```

Notes
- JWT is the single source of truth for role. No DB calls during login.
- Backend role guards implemented and used on protected API endpoints.
- Each dashboard initial load uses one SELECT to fetch the profile `name`.


curl.exe -i -X PUT "https://cfftqaljbzkhjscecnhg.supabase.co/auth/v1/admin/users/3b0f1a8b-3901-4a45-82bd-f04a1c1242d9" `
  -H "apikey: $env:SUPABASE_SERVICE_ROLE_KEY" `
  -H "Authorization: Bearer $env:SUPABASE_SERVICE_ROLE_KEY" `
  -H "Content-Type: application/json" `
  -d '{"user_metadata":{"role":"student","reg_no":"2303811724321005"}}'


node .\sql\import.js .\sql\student_import_template.csv 


 $env:SUPABASE_URL = "https://cfftqaljbzkhjscecnhg.supabase.co"
>> $env:SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmZnRxYWxqYnpraGpzY2VjbmhnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODgwNTU0MiwiZXhwIjoyMDg0MzgxNTQyfQ.B7biUakVIp4993CVyOH2sin1LjkbMDmAozXy4o5qz8U"
>> node .\sql\import.js

node .\sql\import_staff.js .\sql\staff_import_template.csv