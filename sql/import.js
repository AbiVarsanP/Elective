import fs from 'fs'
import csv from 'csv-parser'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const students = []

const csvPath = process.argv[2] || 'student_import_template.csv'

if (!fs.existsSync(csvPath)) {
  console.error('CSV file not found:', csvPath)
  process.exit(1)
}

fs.createReadStream(csvPath)
  .pipe(csv())
  .on('data', (row) => students.push(row))
  .on('end', async () => {
    for (const s of students) {
      try {
        const { data, error } = await supabase.auth.admin.createUser({
          email: s.email,
          password: s.password,
          email_confirm: true,
          user_metadata: {
            role: 'student',
            reg_no: s.reg_no
          }
        })

        if (error) throw error

        const userId = data?.user?.id

        const { error: dbError } = await supabase
          .from('students')
          .insert({
            user_id: userId,
            reg_no: s.reg_no,
            name: s.name,
            email: s.email,
            department_id: Number(s.department_id || 0),
            year: Number(s.year || 0),
            semester: Number(s.semester || 0),
            section: s.section
          })

        if (dbError) throw dbError

        console.log(`✅ Imported: ${s.email}`)
      } catch (err) {
        console.error(`❌ Failed for ${s.email}`, err && err.message ? err.message : err)
      }
    }
  })