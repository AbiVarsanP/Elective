import fs from 'fs'
import csv from 'csv-parser'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY){
  console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const csvPath = process.argv[2] || 'sql/staff_import_template.csv'
if(!fs.existsSync(csvPath)){
  console.error('CSV file not found:', csvPath)
  process.exit(1)
}

const rows = []
fs.createReadStream(csvPath)
  .pipe(csv())
  .on('data', (row) => rows.push(row))
  .on('end', async () => {
    const results = []
    for(const r of rows){
      const email = (r.email || '').trim()
      const password = (r.password || '').trim()
      const name = (r.name || '').trim()
      const department_id = r.department_id ? Number(r.department_id) : null
      const reg_no = (r.reg_no || '').trim()

      if(!email || !name){
        results.push({ email, ok: false, error: 'missing email or name' })
        continue
      }

      const pwd = password || Math.random().toString(36).slice(-10)

      try{
        // create auth user via Admin REST (supabase-js admin helper)
        const adminCreate = supabase && supabase.auth && supabase.auth.admin && typeof supabase.auth.admin.createUser === 'function'
        let userId = null
        if(adminCreate){
          const alt = await supabase.auth.admin.createUser({
            email,
            password: pwd,
            email_confirm: true,
            user_metadata: { role: 'staff', reg_no }
          })
          if(alt?.error){
            results.push({ email, ok: false, error: String(alt.error), raw: alt })
            continue
          }
          userId = alt?.data?.id ?? alt?.data?.user?.id
        } else {
          // fallback to Admin REST directly
          const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ email, password: pwd, user_metadata: { role: 'staff', reg_no } })
          })
          const body = await res.json()
          if(!res.ok){ results.push({ email, ok: false, error: body?.message ?? JSON.stringify(body), raw: body }); continue }
          userId = body?.id ?? body?.user?.id
        }

        if(!userId){ results.push({ email, ok: false, error: 'no user id returned' }); continue }

        // insert into staff table
        const { data: staffData, error: staffErr } = await supabase.from('staff').insert([{ user_id: userId, name, department_id }])
        if(staffErr){ results.push({ email, ok: false, error: staffErr.message }); continue }

        results.push({ email, ok: true, user_id: userId, staff: staffData?.[0] ?? null })
      } catch (err) {
        results.push({ email, ok: false, error: err && err.message ? err.message : String(err), raw: err })
      }
    }

    fs.writeFileSync('import_staff_results.json', JSON.stringify(results, null, 2))
    console.log('Import finished. Results written to import_staff_results.json')
  })
