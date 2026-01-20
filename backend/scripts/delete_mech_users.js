#!/usr/bin/env node
// Delete students from `students` table and corresponding auth users
// Usage:
//   SUPABASE_URL=https://<proj>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role_key> node delete_mech_users.js [DEPT]
// If DEPT is omitted, defaults to "MECH" and matches department name ILIKE '%DEPT%'.

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(2)
}

const TARGET = (process.argv[2] || 'MECH').trim()
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log('Searching for departments matching:', TARGET)
  // Try to find departments whose name contains TARGET (case-insensitive)
  const { data: depts, error: deptErr } = await supabase.from('departments').select('id,name').ilike('name', `%${TARGET}%`)
  if (deptErr) {
    console.error('Failed to query departments:', deptErr.message || deptErr)
    process.exit(1)
  }
  if (!depts || depts.length === 0) {
    console.error('No departments found matching', TARGET)
    process.exit(1)
  }

  const results = []

  for (const dept of depts) {
    console.log('Processing department:', dept.name, 'id=', dept.id)
    const { data: students, error: sErr } = await supabase.from('students').select('id,user_id,email,reg_no').eq('department_id', dept.id)
    if (sErr) {
      console.error('Failed to query students for dept', dept.id, sErr.message || sErr)
      results.push({ department: dept, ok: false, error: String(sErr) })
      continue
    }

    console.log(`Found ${students?.length ?? 0} students for department ${dept.name}`)

    for (const st of students || []) {
      const entry = { student_id: st.id, user_id: st.user_id, email: st.email, reg_no: st.reg_no }
      try {
        // Delete the student row from DB
        const { error: delDbErr } = await supabase.from('students').delete().eq('id', st.id)
        if (delDbErr) {
          entry.db_deleted = false
          entry.db_error = delDbErr.message || String(delDbErr)
        } else {
          entry.db_deleted = true
        }

        // Delete the auth user if user_id present
        if (st.user_id) {
          // Use admin API provided by supabase-js
          const { error: delAuthErr } = await supabase.auth.admin.deleteUser(st.user_id)
          if (delAuthErr) {
            entry.auth_deleted = false
            entry.auth_error = delAuthErr.message || String(delAuthErr)
          } else {
            entry.auth_deleted = true
          }
        } else {
          entry.auth_deleted = false
          entry.auth_error = 'no user_id'
        }
      } catch (e) {
        entry.ok = false
        entry.error = String(e)
      }
      results.push(entry)
      console.log('Processed student', st.email || st.id)
    }
  }

  const out = path.join(process.cwd(), 'delete_mech_results.json')
  fs.writeFileSync(out, JSON.stringify({ target: TARGET, departments: depts, results }, null, 2), 'utf-8')
  console.log('Done. Results written to', out)
}

main().catch(err => { console.error(err); process.exit(1) })
