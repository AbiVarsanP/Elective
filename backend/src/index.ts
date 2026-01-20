import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { verifyJwtMiddleware, requireAdmin, requireStaff, requireStudent, attachUser } from './middleware/auth'
import fs from 'fs'
import path from 'path'
import ExcelJS from 'exceljs'
import multer from 'multer'
const upload = multer()
import crypto from 'crypto'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())

const SUPABASE_URL = process.env.SUPABASE_URL as string
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string
if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')

export const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Public health-check
app.get('/health', (_req, res) => res.json({ ok: true }))

// Resolve an identifier (email or reg_no) to the user's email.
// This endpoint is intentionally public to allow login by reg_no.
app.post('/api/auth/resolve-email', async (req, res) =>{
  try{
    const body = req.body || {}
    const identifier = (body.identifier || body.reg_no || body.value || '') as string
    if(!identifier) return res.status(400).json({ error: 'identifier required' })
    // If looks like email, return as-is
    if(identifier.includes('@')) return res.json({ email: identifier })

    // Try students table
    const { data: s, error: sErr } = await supabaseService.from('students').select('email').eq('reg_no', identifier).maybeSingle()
    if(sErr) return res.status(500).json({ error: sErr.message })
    if(s && s.email) return res.json({ email: s.email })

    // Try staff table
    const { data: st, error: stErr } = await supabaseService.from('staff').select('email').eq('reg_no', identifier).maybeSingle()
    if(stErr) return res.status(500).json({ error: stErr.message })
    if(st && st.email) return res.json({ email: st.email })

    return res.status(404).json({ error: 'Not found' })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Attach user after verifying token
app.use(verifyJwtMiddleware)
app.use(attachUser)

// Admin profile - single select
app.get('/api/admin/profile', requireAdmin, async (req, res) =>{
  const userId = (req as any).user.id
  // Try staff table for admin name (single SELECT)
  const { data, error } = await supabaseService.from('staff').select('name').eq('user_id', userId).maybeSingle()
  if(error) return res.status(500).json({ error: error.message })
  const name = data?.name ?? null
  return res.json({ name })
})

// Admin: list departments
app.get('/api/admin/departments', requireAdmin, async (_req, res) =>{
  try{
    const { data, error } = await supabaseService.from('departments').select('id, name').order('name', { ascending: true })
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ departments: data ?? [] })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Admin: list staff, optionally filtered by department_id
app.get('/api/admin/staff', requireAdmin, async (req, res) =>{
  try{
    const deptId = req.query.department_id as string | undefined
    const q = deptId ? supabaseService.from('staff').select('id, user_id, name, department_id').eq('department_id', deptId) : supabaseService.from('staff').select('id, user_id, name, department_id')
    const { data, error } = await q.order('name', { ascending: true })
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ staff: data ?? [] })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Admin: list parent_electives, optionally filtered by year & sem
app.get('/api/admin/parent_electives', requireAdmin, async (req, res) =>{
  try{
    const year = req.query.year ? Number(req.query.year) : null
    const sem = req.query.sem ? Number(req.query.sem) : null
    let q = supabaseService.from('parent_electives').select('id, name, year, sem').order('name', { ascending: true })
    if(year != null) q = q.eq('year', year)
    if(sem != null) q = q.eq('sem', sem)
    const { data, error } = await q
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ parent_electives: data ?? [] })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Admin: create elective
app.post('/api/admin/electives', requireAdmin, async (req, res) =>{
  try{
    const body = req.body || {}
    const subject_name = body.subject_name ?? null
    const subject_code = body.subject_code ?? null
    const providing_department_id = body.providing_department_id ?? null
    const parent_elective_id = body.parent_elective_id ?? null
    const total_seats = Number(body.total_seats ?? 0)
    const blocked_department_ids: string[] = Array.isArray(body.blocked_department_ids) ? body.blocked_department_ids : []
    const staff_id = body.staff_id ?? null

    if(!subject_name || !subject_code || !providing_department_id) return res.status(400).json({ error: 'subject_name, subject_code and providing_department_id are required' })

    const insertObj: any = {
      subject_name,
      subject_code,
      providing_department_id,
      total_seats: Number(total_seats) || 0,
      filled_seats: 0,
      is_active: true,
      polling_closed: false
    }
    if(parent_elective_id) insertObj.parent_elective_id = parent_elective_id

    const { data: inserted, error: insErr } = await supabaseService.from('electives').insert([insertObj]).select().maybeSingle()
    if(insErr) return res.status(500).json({ error: insErr.message })
    const newElective = inserted

    // insert blocked departments (ensure providing dept is included)
    const allBlocked = Array.from(new Set([...(blocked_department_ids ?? []), String(providing_department_id)]))
    if(allBlocked.length > 0){
      const rows = allBlocked.map(did => ({ elective_id: newElective.id, department_id: did }))
      // upsert-like: ignore conflicts if table has uniqueness
      await supabaseService.from('elective_blocked_departments').insert(rows)
    }

    // optionally, link staff -> elective: prefer `elective_staff`, fallback to legacy `staff_electives`
    if(staff_id){
      try{
        await supabaseService.from('elective_staff').insert([{ staff_user_id: staff_id, elective_id: newElective.id }])
      }catch(_e){
        try{ await supabaseService.from('staff_electives').insert([{ staff_id, elective_id: newElective.id }]) }catch(__){/* ignore */}
      }
    }

    return res.json({ elective: newElective })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Admin: bulk create electives under a single parent (rows: [{ subject_name, subject_code, providing_department_id, total_seats, staff_id }])
app.post('/api/admin/electives/bulk', requireAdmin, async (req, res) =>{
  try{
    const body = req.body || {}
    const parent_elective_id = body.parent_elective_id ?? null
    const rows = Array.isArray(body.rows) ? body.rows : []
    const blocked_department_ids: string[] = Array.isArray(body.blocked_department_ids) ? body.blocked_department_ids : []

    if(rows.length === 0) return res.status(400).json({ error: 'no rows provided' })

    const created: any[] = []
    const errors: any[] = []

    for(const r of rows){
      try{
        const subject_name = r.subject_name ?? null
        const subject_code = r.subject_code ?? null
        const providing_department_id = r.providing_department_id ?? null
        const total_seats = Number(r.total_seats ?? 0)
        const staff_id = r.staff_id ?? null

        if(!subject_name || !subject_code || !providing_department_id){
          errors.push({ row: r, error: 'missing required fields' })
          continue
        }

        const insertObj: any = {
          subject_name,
          subject_code,
          providing_department_id,
          total_seats: Number(total_seats) || 0,
          filled_seats: 0,
          is_active: true,
          polling_closed: false
        }
        // prefer per-row parent id if provided, otherwise use outer parent_elective_id
        const rowParent = r.parent_elective_id ?? parent_elective_id
        if(rowParent) insertObj.parent_elective_id = rowParent
        // accept optional subject_year/subject_semester (kept for clarity, not required by schema)
        if(r.subject_year) insertObj.subject_year = r.subject_year
        if(r.subject_semester) insertObj.subject_semester = r.subject_semester

        const { data: inserted, error: insErr } = await supabaseService.from('electives').insert([insertObj]).select().maybeSingle()
        if(insErr){ errors.push({ row: r, error: insErr.message }); continue }
        const newElective = inserted

        const allBlocked = Array.from(new Set([...(blocked_department_ids ?? []), String(providing_department_id)]))
        if(allBlocked.length > 0){
          const rowsToInsert = allBlocked.map(did => ({ elective_id: newElective.id, department_id: did }))
          await supabaseService.from('elective_blocked_departments').insert(rowsToInsert)
        }

        if(staff_id){
          try{ await supabaseService.from('elective_staff').insert([{ staff_user_id: staff_id, elective_id: newElective.id }]) }
          catch(_e){ try{ await supabaseService.from('staff_electives').insert([{ staff_id, elective_id: newElective.id }]) }catch(__){} }
        }

        created.push(newElective)
      }catch(err:any){ errors.push({ row: r, error: err.message ?? String(err) }) }
    }

    return res.json({ created, errors })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Admin: download CSV for a parent group (subjects + students)
app.get('/api/admin/electives/group/:parent/download', requireAdmin, async (req, res) =>{
  const parent = String(req.params.parent)
  try{
    // parent may be 'Other', a parent_elective id (uuid), or a parent name.
    let electivesQuery
    if(parent === 'Other'){
      electivesQuery = supabaseService.from('electives').select('id, subject_code, subject_name, parent_elective_id, parent_electives(name, year, sem)').is('parent_elective_id', null)
    } else if(parent && parent.length === 36 && parent.includes('-')){
      electivesQuery = supabaseService.from('electives').select('id, subject_code, subject_name, parent_elective_id, parent_electives(name, year, sem)').eq('parent_elective_id', parent)
    } else {
      // treat as parent name: find matching parent_electives then fetch electives
      const { data: parents, error: pErr } = await supabaseService.from('parent_electives').select('id').ilike('name', parent)
      if(pErr) return res.status(500).json({ error: pErr.message })
      const ids = (parents ?? []).map((p:any)=> p.id)
      electivesQuery = ids.length > 0
        ? supabaseService.from('electives').select('id, subject_code, subject_name, parent_elective_id, parent_electives(name, year, sem)').in('parent_elective_id', ids)
        : supabaseService.from('electives').select('id, subject_code, subject_name, parent_elective_id, parent_electives(name, year, sem)').eq('parent_elective_id', '____none____')
    }

    const { data: electives, error: electErr } = await electivesQuery
    if(electErr) return res.status(500).json({ error: electErr.message })

    // gather elective ids
    const electiveIds = (electives ?? []).map((e:any) => e.id).filter(Boolean)

    // fetch registrations for these electives
    let regs: any[] = []
    if(electiveIds.length > 0){
      const { data: r, error: rErr } = await supabaseService.from('elective_registrations').select('elective_id, student_id').in('elective_id', electiveIds)
      if(rErr) return res.status(500).json({ error: rErr.message })
      regs = r ?? []
    }

    // map elective -> student ids
    const electToStudents: Record<string, string[]> = {}
    for(const row of regs) {
      if(!row.elective_id || !row.student_id) continue
      electToStudents[String(row.elective_id)] = electToStudents[String(row.elective_id)] || []
      electToStudents[String(row.elective_id)].push(row.student_id)
    }

    // fetch all student ids
    const allStudentIds = Array.from(new Set(Object.values(electToStudents).flat()))
    let students: any[] = []
    if(allStudentIds.length > 0){
      const { data: s, error: sErr } = await supabaseService.from('students').select('id, user_id, reg_no, name, email, year, semester, section, department_id').in('id', allStudentIds)
      if(sErr) return res.status(500).json({ error: sErr.message })
      students = s ?? []
    }

    // map student id -> student
    const studentMap: Record<string, any> = {}
    for(const s of students) studentMap[String(s.id)] = s

    // fetch department names
    const deptIds = Array.from(new Set(students.map((s:any)=> s.department_id).filter(Boolean)))
    const deptMap: Record<string,string> = {}
    if(deptIds.length > 0){
      const { data: depts, error: dErr } = await supabaseService.from('departments').select('id, name').in('id', deptIds)
      if(dErr) console.error('Failed to load departments for export', dErr)
      else for(const d of depts ?? []) deptMap[String(d.id)] = d.name
    }

    // build CSV rows
    const header = ['elective_id','parent_name','subject_code','subject_name','subject_year','subject_semester','student_id','student_reg_no','student_name','student_year','student_semester','student_section','student_department','student_email']
    const lines: string[] = []
    lines.push(header.join(','))

    for(const e of (electives ?? [])){
      const sidList = electToStudents[String(e.id)] ?? []
      if(sidList.length === 0){
        const parentObj = Array.isArray(e.parent_electives) ? e.parent_electives[0] : e.parent_electives
        const parentName = parentObj ? parentObj.name : ''
        const parentYear = parentObj ? parentObj.year : ''
        const parentSem = parentObj ? parentObj.sem : ''
        const row = [e.id, parentName ?? '', e.subject_code ?? '', e.subject_name ?? '', parentYear ?? '', parentSem ?? '', '', '', '', '', '', '', '']
        lines.push(row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','))
      } else {
        for(const sid of sidList){
          const s = studentMap[String(sid)]
          const deptName = s?.department_id ? deptMap[String(s.department_id)] ?? '' : ''
          const parentObj = Array.isArray(e.parent_electives) ? e.parent_electives[0] : e.parent_electives
          const parentName = parentObj ? parentObj.name : ''
          const parentYear = parentObj ? parentObj.year : ''
          const parentSem = parentObj ? parentObj.sem : ''
          const row = [e.id, parentName ?? '', e.subject_code ?? '', e.subject_name ?? '', parentYear ?? '', parentSem ?? '', s?.id ?? '', s?.reg_no ?? '', s?.name ?? '', s?.year ?? '', s?.semester ?? '', s?.section ?? '', deptName, s?.email ?? '']
          lines.push(row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','))
        }
      }
    }

    const csv = lines.join('\n')
    res.header('Content-Type','text/csv')
    res.attachment(`electives_${parent}_students.csv`)
    return res.send(csv)
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Download CSV template for bulk student import
app.get('/api/admin/students/template', requireAdmin, async (_req, res) =>{
  try{
    // Try several likely locations for the template file so the endpoint works
    // whether the server is started from project root or from the backend folder.
    const candidates = [
      path.join(process.cwd(), 'sql', 'student_import_template.csv'),
      path.join(process.cwd(), '..', 'sql', 'student_import_template.csv'),
      path.join(__dirname, '..', 'sql', 'student_import_template.csv'),
      path.join(__dirname, '..', '..', 'sql', 'student_import_template.csv'),
    ]
    const found = candidates.find(p => fs.existsSync(p))
    if(!found){
      console.error('student_import_template.csv not found. Tried:', candidates)
      return res.status(404).send('template not found')
    }
    const csv = fs.readFileSync(found, 'utf-8')
    res.header('Content-Type','text/csv')
    res.attachment('student_import_template.csv')
    return res.send(csv)
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Download CSV template for bulk subject import
app.get('/api/admin/subjects/template', requireAdmin, async (_req, res) =>{
  try{
    const candidates = [
      path.join(process.cwd(), 'sql', 'subject_import_template.csv'),
      path.join(process.cwd(), '..', 'sql', 'subject_import_template.csv'),
      path.join(__dirname, '..', 'sql', 'subject_import_template.csv'),
      path.join(__dirname, '..', '..', 'sql', 'subject_import_template.csv'),
    ]
    const found = candidates.find(p => fs.existsSync(p))
    if(!found){
      console.error('subject_import_template.csv not found. Tried:', candidates)
      return res.status(404).send('template not found')
    }
    const csv = fs.readFileSync(found, 'utf-8')
    res.header('Content-Type','text/csv')
    res.attachment('subject_import_template.csv')
    return res.send(csv)
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Generate XLSX template with dropdowns for providing_department and staff_name
app.get('/api/admin/subjects/template.xlsx', requireAdmin, async (req, res) =>{
  try{
    // load departments and staff from DB
    const [{ data: depts, error: dErr }, { data: staff, error: sErr }] = await Promise.all([
      supabaseService.from('departments').select('id, name').order('name', { ascending: true }),
      supabaseService.from('staff').select('id, name, department_id').order('name', { ascending: true })
    ])
    if(dErr) console.error('Failed to load departments for xlsx template', dErr)
    if(sErr) console.error('Failed to load staff for xlsx template', sErr)

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Template')
    const listSheet = workbook.addWorksheet('Lists')

    // Header
    sheet.addRow(['subject_name', 'subject_code', 'providing_department', 'staff_name', 'total_seats'])

    // sample rows (optional)
    const samples = [
      ['Introduction to AI','AI101','Computer Science','Dr. Alice Smith',30],
      ['Data Structures','CS102','Computer Science','Dr. Bob Kumar',40]
    ]
    for(const s of samples) sheet.addRow(s)

    // populate lists sheet
    const deptNames = (depts ?? []).map((d:any)=> d.name ?? '')
    const staffNames = (staff ?? []).map((s:any)=> s.name ?? '')
    for(let i=0;i<deptNames.length;i++) listSheet.getCell(`A${i+1}`).value = deptNames[i]
    for(let i=0;i<staffNames.length;i++) listSheet.getCell(`B${i+1}`).value = staffNames[i]

    // hide lists sheet
    listSheet.state = 'hidden'

    // Add data validation for rows 2..500 on columns C (providing_department) and D (staff_name)
    const maxRows = 500
    for(let r=2; r<=maxRows; r++){
      const deptCell = `C${r}`
      const staffCell = `D${r}`
      ;(sheet as any).dataValidations.add(deptCell, { type: 'list', allowBlank: true, formulae: [`Lists!$A$1:$A$${deptNames.length || 1}`] })
      ;(sheet as any).dataValidations.add(staffCell, { type: 'list', allowBlank: true, formulae: [`Lists!$B$1:$B$${staffNames.length || 1}`] })
    }

    const buf = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename=subject_import_template.xlsx')
    return res.send(buf)
  }catch(err:any){
    console.error('Failed to generate xlsx template', err)
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Parse uploaded XLSX (or CSV) and return rows as JSON for preview
app.post('/api/admin/subjects/parse', requireAdmin, upload.single('file'), async (req, res) =>{
  try{
    const uploaded = (req as any).file
    if(!uploaded) return res.status(400).json({ error: 'no file uploaded' })
    const filename = uploaded.originalname || ''
    const buf = uploaded.buffer
    const ext = filename.split('.').pop()?.toLowerCase() ?? ''
    if(ext === 'csv' || filename.endsWith('.csv')){
      const text = buf.toString('utf-8')
      // reuse simple CSV parser
      const parseLine = (line:string)=>{
        const res:string[] = []; let cur=''; let inQ=false
        for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ if(inQ && line[i+1]==='"'){ cur+='"'; i++ } else inQ=!inQ } else if(ch===',' && !inQ){ res.push(cur); cur='' } else cur+=ch }
        res.push(cur); return res.map(s=>s.trim())
      }
      const cleaned = text.replace(/\r/g,'')
      const lines = cleaned.split('\n').map((l:string)=>l.trim()).filter((l:string)=>l.length>0)
      if(lines.length===0) return res.json({ rows: [] })
      const header = parseLine(lines[0])
      const rows = lines.slice(1).map((line:string)=>{ const vals = parseLine(line); const obj:any={}; header.forEach((h,i)=> obj[h]=vals[i]??''); return obj })
      return res.json({ rows })
    }

    // parse xlsx
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buf)
    const sheet = workbook.worksheets[0]
    if(!sheet) return res.json({ rows: [] })
    // read rows assuming first row is header
    const rows:any[] = []
    const headerRow = sheet.getRow(1)
    const headerVals = ((headerRow.values as any[]) || []).slice(1)
    const headers = headerVals.map((v:any) => String(v ?? '').trim())
    sheet.eachRow((row: any, rowNumber: number)=>{
      if(rowNumber === 1) return
      const vals = ((row.values as any[]) || []).slice(1)
      const obj:any = {}
      for(let i=0;i<headers.length;i++) obj[headers[i]] = vals[i] ?? ''
      // only include non-empty rows
      if(Object.values(obj).some((v:any)=> String(v).trim().length>0)) rows.push(obj)
    })
    return res.json({ rows })
  }catch(err:any){
    console.error('parse upload failed', err)
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Bulk import students: accepts JSON array of rows { email, password?, reg_no, name, year, semester, section, department_id }
app.post('/api/admin/students/import', requireAdmin, async (req, res) =>{
  try{
    const rows = req.body?.rows
    if(!Array.isArray(rows)) return res.status(400).json({ error: 'expected JSON body { rows: [..] }' })

    const results: any[] = []
    for(const row of rows){
      const email = row.email as string
      let password = row.password as string | undefined
      const reg_no = row.reg_no as string
      const name = row.name as string
      const year = row.year ?? null
      const semester = row.semester ?? null
      const section = row.section ?? null
      const department_id = row.department_id ?? null

      if(!email || !reg_no){
        results.push({ email, error: 'missing email or reg_no' })
        continue
      }

      if(!password){
        password = crypto.randomBytes(8).toString('hex')
      }

      // create auth user via Supabase Admin REST API
      const adminUrl = `${SUPABASE_URL}/auth/v1/admin/users`
      const body = { email, password, user_metadata: { role: 'student', reg_no } }
      const createResp = await fetch(adminUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify(body)
      })
      const createJson = await createResp.json()
      if(!createResp.ok){
        // log detailed response to server logs for debugging (won't expose service key)
        console.error('Supabase admin create user failed', { status: createResp.status, body: createJson })

        // If Supabase says not_admin, provide clearer guidance
        if(createJson?.error_code === 'not_admin' || createJson?.msg === 'User not allowed'){
          const maskedKey = SUPABASE_SERVICE_ROLE_KEY ? (SUPABASE_SERVICE_ROLE_KEY.slice(0,4) + '...' + SUPABASE_SERVICE_ROLE_KEY.slice(-4)) : '<missing>'
          console.error('Supabase admin operation rejected: not_admin. SUPABASE_URL=', SUPABASE_URL, 'SERVICE_KEY(masked)=', maskedKey)
          results.push({ email, error: 'Supabase admin API rejected the request (not_admin). Ensure SUPABASE_SERVICE_ROLE_KEY env var is the project service_role key and that SUPABASE_URL is correct.', raw: createJson })
          continue
        }

        // Fallback: try using supabase-js admin method if available (some SDKs expose admin helpers)
        try{
          const adminCreateFn = (supabaseService as any)?.auth?.admin?.createUser
          if(typeof adminCreateFn === 'function'){
            const alt = await adminCreateFn.call((supabaseService as any).auth.admin, { email, password, user_metadata: { role: 'student', reg_no } })
            // alt may be { data, error }
            if(alt?.error) {
              results.push({ email, error: String(alt.error), raw: alt })
              continue
            }
            const userId = alt?.data?.id ?? alt?.data?.user?.id
            if(!userId){ results.push({ email, error: 'admin SDK returned no user id', raw: alt }); continue }
            const { data: studentData, error: studentErr } = await supabaseService.from('students').insert([{ user_id: userId, reg_no, name, year, semester, section, department_id, email }])
            if(studentErr){ results.push({ email, error: studentErr.message, raw: studentErr }); continue }
            results.push({ email, ok: true, user_id: userId, student: studentData?.[0] ?? null })
            continue
          }
        }catch(e:any){
          console.error('Fallback admin create failed', e)
        }

        // include raw response to help diagnose other errors
        const errMsg = createJson?.message ?? (createJson ? JSON.stringify(createJson) : 'failed to create auth user')
        results.push({ email, error: errMsg, raw: createJson })
        continue
      }

      const userId = createJson?.id ?? createJson?.user?.id
      if(!userId){
        results.push({ email, error: 'no user id returned from auth create', raw: createJson })
        continue
      }

      // insert into students table
      const { data: studentData, error: studentErr } = await supabaseService.from('students').insert([{
        user_id: userId,
        reg_no,
        name,
        year,
        semester,
        section,
        department_id,
        email
      }])
      if(studentErr){
        results.push({ email, error: studentErr.message })
        continue
      }

      results.push({ email, ok: true, user_id: userId, student: studentData?.[0] ?? null })
    }

    return res.json({ results })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Admin: list electives (lazy heavy data)
app.get('/api/admin/electives', requireAdmin, async (req, res) =>{
  try{
    const { data, error } = await supabaseService
      .from('electives')
      .select('id, parent_elective_id, parent_electives(name, year, sem), subject_name, subject_code, providing_department_id, total_seats, filled_seats, is_active, polling_closed, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    if(error) return res.status(500).json({ error: error.message })
    return res.json({ electives: data ?? [] })
  }catch(err: any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Activate elective
app.patch('/api/admin/electives/:id/activate', requireAdmin, async (req, res) =>{
  const id = req.params.id
  try{
    const { data, error } = await supabaseService.from('electives').update({ is_active: true }).eq('id', id).select().maybeSingle()
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ elective: data })
  }catch(err: any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Deactivate elective
app.patch('/api/admin/electives/:id/deactivate', requireAdmin, async (req, res) =>{
  const id = req.params.id
  try{
    const { data, error } = await supabaseService.from('electives').update({ is_active: false }).eq('id', id).select().maybeSingle()
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ elective: data })
  }catch(err: any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Close polling for elective
app.patch('/api/admin/electives/:id/polling-close', requireAdmin, async (req, res) =>{
  const id = req.params.id
  try{
    const { data, error } = await supabaseService.from('electives').update({ polling_closed: true }).eq('id', id).select().maybeSingle()
    if(error) return res.status(500).json({ error: error.message })
    // (Optional) business logic to "float to students" is handled client-side by is_active flag
    return res.json({ elective: data })
  }catch(err: any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Group actions (by parent_code)
app.patch('/api/admin/electives/group/:parent/activate', requireAdmin, async (req, res) =>{
  const parent = String(req.params.parent)
  try{
    // Build query: support 'Other', parent id (uuid), or parent name
    let query
    if(parent === 'Other'){
      query = supabaseService.from('electives').update({ is_active: true }).is('parent_elective_id', null)
    } else if(parent && parent.length === 36 && parent.includes('-')){
      query = supabaseService.from('electives').update({ is_active: true }).eq('parent_elective_id', parent)
    } else {
      const { data: parents, error: pErr } = await supabaseService.from('parent_electives').select('id').ilike('name', parent)
      if(pErr) return res.status(500).json({ error: pErr.message })
      const ids = (parents ?? []).map((p:any)=> p.id)
      query = ids.length > 0 ? supabaseService.from('electives').update({ is_active: true }).in('parent_elective_id', ids) : supabaseService.from('electives').update({ is_active: true }).eq('parent_elective_id','____none____')
    }
    const { data, error } = await query.select('id, parent_elective_id, parent_electives(name, year, sem), subject_name, subject_code, providing_department_id, total_seats, filled_seats, is_active, polling_closed, created_at')
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ updated: data?.length ?? 0, electives: data ?? [] })
  }catch(err: any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

app.patch('/api/admin/electives/group/:parent/deactivate', requireAdmin, async (req, res) =>{
  const parent = String(req.params.parent)
  try{
    // Build query: support 'Other', parent id (uuid), or parent name
    let query
    if(parent === 'Other'){
      query = supabaseService.from('electives').update({ is_active: false }).is('parent_elective_id', null)
    } else if(parent && parent.length === 36 && parent.includes('-')){
      query = supabaseService.from('electives').update({ is_active: false }).eq('parent_elective_id', parent)
    } else {
      const { data: parents, error: pErr } = await supabaseService.from('parent_electives').select('id').ilike('name', parent)
      if(pErr) return res.status(500).json({ error: pErr.message })
      const ids = (parents ?? []).map((p:any)=> p.id)
      query = ids.length > 0 ? supabaseService.from('electives').update({ is_active: false }).in('parent_elective_id', ids) : supabaseService.from('electives').update({ is_active: false }).eq('parent_elective_id','____none____')
    }
    const { data, error } = await query.select('id, parent_elective_id, parent_electives(name, year, sem), subject_name, subject_code, providing_department_id, total_seats, filled_seats, is_active, polling_closed, created_at')
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ updated: data?.length ?? 0, electives: data ?? [] })
  }catch(err: any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

app.patch('/api/admin/electives/group/:parent/polling-close', requireAdmin, async (req, res) =>{
  const parent = String(req.params.parent)
  try{
    // Build query: support 'Other', parent id (uuid), or parent name
    let query
    if(parent === 'Other'){
      query = supabaseService.from('electives').update({ polling_closed: true }).is('parent_elective_id', null)
    } else if(parent && parent.length === 36 && parent.includes('-')){
      query = supabaseService.from('electives').update({ polling_closed: true }).eq('parent_elective_id', parent)
    } else {
      const { data: parents, error: pErr } = await supabaseService.from('parent_electives').select('id').ilike('name', parent)
      if(pErr) return res.status(500).json({ error: pErr.message })
      const ids = (parents ?? []).map((p:any)=> p.id)
      query = ids.length > 0 ? supabaseService.from('electives').update({ polling_closed: true }).in('parent_elective_id', ids) : supabaseService.from('electives').update({ polling_closed: true }).eq('parent_elective_id','____none____')
    }
    const { data, error } = await query.select('id, parent_elective_id, parent_electives(name, year, sem), subject_name, subject_code, providing_department_id, total_seats, filled_seats, is_active, polling_closed, created_at')
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ updated: data?.length ?? 0, electives: data ?? [] })
  }catch(err: any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Staff profile
app.get('/api/staff/profile', requireStaff, async (req, res) =>{
  const userId = (req as any).user.id
  const { data, error } = await supabaseService.from('staff').select('name').eq('user_id', userId).maybeSingle()
  if(error) return res.status(500).json({ error: error.message })
  const name = data?.name ?? null
  return res.json({ name })
})

// Staff: list electives assigned to staff's department
app.get('/api/staff/electives', requireStaff, async (req, res) =>{
  try{
    const userId = (req as any).user?.id
    const { data: staffRow, error: staffErr } = await supabaseService.from('staff').select('id, user_id, department_id').eq('user_id', userId).maybeSingle()
    if(staffErr) return res.status(500).json({ error: staffErr.message })
    const deptId = staffRow?.department_id
    if(!deptId) return res.json({ electives: [] })

    const { data, error } = await supabaseService.from('electives').select('id, parent_elective_id, parent_electives(name, year, sem), subject_name, subject_code, providing_department_id, total_seats, filled_seats, is_active, polling_closed, created_at').eq('providing_department_id', deptId).order('created_at', { ascending: false })
    if(error) return res.status(500).json({ error: error.message })
    return res.json({ electives: data ?? [] })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Staff: list students for an elective (only if elective belongs to staff's department)
app.get('/api/staff/electives/:id/students', requireStaff, async (req, res) =>{
  const electiveId = req.params.id
  try{
    const userId = (req as any).user?.id
    const { data: staffRow, error: staffErr } = await supabaseService.from('staff').select('department_id').eq('user_id', userId).maybeSingle()
    if(staffErr) return res.status(500).json({ error: staffErr.message })
    const deptId = staffRow?.department_id

    const { data: elective, error: eErr } = await supabaseService.from('electives').select('id, providing_department_id').eq('id', electiveId).maybeSingle()
    if(eErr) return res.status(500).json({ error: eErr.message })
    if(!elective) return res.status(404).json({ error: 'elective not found' })
    if(elective.providing_department_id !== deptId) return res.status(403).json({ error: 'not allowed' })

    const { data: regs, error: regErr } = await supabaseService.from('elective_registrations').select('student_id').eq('elective_id', electiveId)
    if(regErr) return res.status(500).json({ error: regErr.message })
    const studentIds = (regs ?? []).map((r:any)=> r.student_id).filter(Boolean)
    if(studentIds.length === 0) return res.json({ students: [] })

    const { data: students, error: studErr } = await supabaseService.from('students').select('id, user_id, reg_no, name, email, year, semester, section, department_id').in('id', studentIds)
    if(studErr) return res.status(500).json({ error: studErr.message })

    // map department names
    const deptIds = Array.from(new Set((students ?? []).map((s:any)=> s.department_id).filter(Boolean)))
    const deptMap: Record<string,string> = {}
    if(deptIds.length > 0){
      const { data: depts, error: dErr } = await supabaseService.from('departments').select('id, name').in('id', deptIds)
      if(!dErr) for(const d of depts ?? []) deptMap[String(d.id)] = d.name
    }

    const enriched = (students ?? []).map((s:any)=> ({ ...s, department_name: s.department_id ? deptMap[String(s.department_id)] ?? null : null }))
    return res.json({ students: enriched })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Staff: download CSV for a single elective (if belongs to staff's department)
app.get('/api/staff/electives/:id/download', requireStaff, async (req, res) =>{
  const electiveId = req.params.id
  try{
    const userId = (req as any).user?.id
    const { data: staffRow, error: staffErr } = await supabaseService.from('staff').select('department_id').eq('user_id', userId).maybeSingle()
    if(staffErr) return res.status(500).json({ error: staffErr.message })
    const deptId = staffRow?.department_id

    const { data: elective, error: eErr } = await supabaseService.from('electives').select('id, parent_elective_id, parent_electives(name, year, sem), subject_code, subject_name, providing_department_id').eq('id', electiveId).maybeSingle()
    if(eErr) return res.status(500).json({ error: eErr.message })
    if(!elective) return res.status(404).json({ error: 'elective not found' })
    if(elective.providing_department_id !== deptId) return res.status(403).json({ error: 'not allowed' })

    const { data: regs, error: regErr } = await supabaseService.from('elective_registrations').select('student_id').eq('elective_id', electiveId)
    if(regErr) return res.status(500).json({ error: regErr.message })
    const studentIds = (regs ?? []).map((r:any)=> r.student_id).filter(Boolean)

    let students: any[] = []
    if(studentIds.length > 0){
      const { data: s, error: sErr } = await supabaseService.from('students').select('id, reg_no, name, email, year, semester, section, department_id').in('id', studentIds)
      if(sErr) return res.status(500).json({ error: sErr.message })
      students = s ?? []
    }

    const deptIds = Array.from(new Set(students.map((s:any)=> s.department_id).filter(Boolean)))
    const deptMap: Record<string,string> = {}
    if(deptIds.length > 0){
      const { data: depts, error: dErr } = await supabaseService.from('departments').select('id, name').in('id', deptIds)
      if(!dErr) for(const d of depts ?? []) deptMap[String(d.id)] = d.name
    }

    const header = ['student_id','student_reg_no','student_name','student_year','student_semester','student_section','student_department','student_email']
    const lines = [header.join(',')]
    for(const s of students){
      const deptName = s.department_id ? deptMap[String(s.department_id)] ?? '' : ''
      const row = [s.id ?? '', s.reg_no ?? '', s.name ?? '', s.year ?? '', s.semester ?? '', s.section ?? '', deptName, s.email ?? '']
      lines.push(row.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(','))
    }
    const csv = lines.join('\n')
    res.header('Content-Type','text/csv')
    res.attachment(`elective_${electiveId}_students.csv`)
    return res.send(csv)
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Student profile
app.get('/api/student/profile', requireStudent, async (req, res) =>{
  try{
    const userId = (req as any).user?.id
    const rawJwt = (req as any)._supabase_jwt
    const regNo = rawJwt?.user_metadata?.reg_no ?? rawJwt?.user_metadata?.regNo ?? null

    // Prefer lookup by user_id
    if(userId){
      const { data: byUser, error: err1 } = await supabaseService.from('students').select('name').eq('user_id', userId).maybeSingle()
      if(err1) return res.status(500).json({ error: err1.message })
      if(byUser && byUser.name) return res.json({ name: byUser.name })
    }

    // Fallback: lookup by reg_no if provided
    if(regNo){
      const { data: byReg, error: err2 } = await supabaseService.from('students').select('name').eq('reg_no', regNo).maybeSingle()
      if(err2) return res.status(500).json({ error: err2.message })
      if(byReg && byReg.name) return res.json({ name: byReg.name })
    }

    // If still not found, return null name
    return res.json({ name: null })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Student: list active, open electives
app.get('/api/student/electives', requireStudent, async (req, res) =>{
  try{
    // Determine student profile (year/semester/department)
    const userId = (req as any).user?.id
    const rawJwt = (req as any)._supabase_jwt
    const regNo = rawJwt?.user_metadata?.reg_no ?? rawJwt?.user_metadata?.regNo ?? null

    let student: any = null
    if(userId){
      const { data: s1, error: e1 } = await supabaseService.from('students').select('id, user_id, name, year, semester, department_id, reg_no').eq('user_id', userId).maybeSingle()
      if(e1) return res.status(500).json({ error: e1.message })
      student = s1 ?? null
    }
    if(!student && regNo){
      const { data: s2, error: e2 } = await supabaseService.from('students').select('id, user_id, name, year, semester, department_id, reg_no').eq('reg_no', regNo).maybeSingle()
      if(e2) return res.status(500).json({ error: e2.message })
      student = s2 ?? null
    }

    // If no student profile found, return empty list
    if(!student) return res.json({ electives: [] })

    const { year, semester, department_id } = student

    // find electives blocked for this department
    let blockedIds: string[] = []
    if(department_id){
      const { data: bd, error: bErr } = await supabaseService.from('elective_blocked_departments').select('elective_id').eq('department_id', department_id)
      if(bErr) return res.status(500).json({ error: bErr.message })
      blockedIds = (bd ?? []).map((r:any)=> r.elective_id).filter(Boolean)
    }

    // Query electives matching student's year/semester, active/open, and not blocked for their dept
    const query = supabaseService.from('electives')
      .select('id, parent_elective_id, parent_electives(name, year, sem), subject_name, subject_code, providing_department_id, total_seats, filled_seats, is_active, polling_closed')
      .eq('is_active', true)
      .eq('polling_closed', false)
      .order('subject_name', { ascending: true })

    if(blockedIds.length > 0){
      // We'll exclude blocked ids in JS after fetching to avoid SQL quoting issues
    }

    const { data, error } = await query.limit(500)
    if(error) return res.status(500).json({ error: error.message })
    let rows = data ?? []

    // Filter by student's year/semester using parent_electives relation
    rows = rows.filter((r:any) => {
      const py = r.parent_electives?.year ?? null
      const ps = r.parent_electives?.sem ?? null
      return (py === year) && (ps === semester)
    })

    // find registrations for this student to mark registered status
    const { data: regs, error: regErr } = await supabaseService.from('elective_registrations').select('elective_id').eq('student_id', student.id)
    if(regErr) return res.status(500).json({ error: regErr.message })
    const regSet = new Set((regs ?? []).map((r:any)=> String(r.elective_id)))

    const filtered = blockedIds.length > 0 ? rows.filter((r:any)=> !blockedIds.includes(r.id)) : rows
    const enriched = filtered.map((r:any) => ({
      ...r,
      registered: regSet.has(String(r.id)),
      is_full: (typeof r.filled_seats === 'number' && typeof r.total_seats === 'number') ? (r.filled_seats >= r.total_seats) : false
    }))
    const registeredElectiveId = Array.from(regSet)[0] ?? null
    const can_register = registeredElectiveId == null
    return res.json({ electives: enriched, registeredElectiveId, can_register })
  }catch(err: any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

const port = Number(process.env.PORT ?? 54321)
app.listen(port, ()=> console.log(`Server listening on ${port}`))

// Student: register for one elective (atomic, uses DB function `register_elective`)
app.post('/api/student/register', requireStudent, async (req, res) =>{
  try{
    const userId = (req as any).user?.id
    const { elective_id } = req.body
    if(!userId) return res.status(401).json({ error: 'Missing user' })
    if(!elective_id) return res.status(400).json({ error: 'Missing elective_id' })

    // Call Postgres function registered in registration_migration.sql
    const { data, error } = await supabaseService.rpc('register_elective', { p_student_user_id: userId, p_elective_id: elective_id })
    if(error) return res.status(500).json({ error: error.message })
    const row = Array.isArray(data) ? data[0] : data
    return res.json({ result: row })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Admin-only: masked check that service role key and URL are set correctly
app.get('/api/admin/_service_key_check', requireAdmin, async (_req, res) =>{
  try{
    const hasKey = !!SUPABASE_SERVICE_ROLE_KEY
    const masked = hasKey ? (SUPABASE_SERVICE_ROLE_KEY.slice(0,4) + '...' + SUPABASE_SERVICE_ROLE_KEY.slice(-4)) : null
    return res.json({ ok: true, supabase_url: SUPABASE_URL, service_key_present: hasKey, masked_key: masked })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})

// Admin: list students who selected a given elective
app.get('/api/admin/electives/:id/students', requireAdmin, async (req, res) =>{
  const electiveId = req.params.id
  try{
    // find registrations for this elective
    const { data: regs, error: regErr } = await supabaseService.from('elective_registrations').select('student_id').eq('elective_id', electiveId)
    if(regErr) return res.status(500).json({ error: regErr.message })
    const studentIds = (regs ?? []).map((r:any) => r.student_id).filter(Boolean)
    if(studentIds.length === 0) return res.json({ students: [] })

    const { data: students, error: studErr } = await supabaseService.from('students').select('id, user_id, reg_no, name, email, year, semester, section, department_id').in('id', studentIds)
    if(studErr) return res.status(500).json({ error: studErr.message })

    // fetch department names for mapping
    const deptIds = Array.from(new Set((students ?? []).map((s:any) => s.department_id).filter(Boolean)))
    const deptMap: Record<string,string> = {}
    if(deptIds.length > 0){
      const { data: depts, error: dErr } = await supabaseService.from('departments').select('id, name').in('id', deptIds)
      if(dErr) {
        // don't fail entire request for department lookup; log and continue
        console.error('Failed to load departments for students list', dErr)
      } else {
        for(const d of depts ?? []) deptMap[String(d.id)] = d.name
      }
    }

    const enrichedStudents = (students ?? []).map((s:any) => ({
      ...s,
      department_name: s.department_id ? deptMap[String(s.department_id)] ?? null : null
    }))

    return res.json({ students: enrichedStudents })
  }catch(err:any){
    return res.status(500).json({ error: err.message ?? String(err) })
  }
})


