#!/usr/bin/env node
// Direct import script: reads CSV, creates auth users via Supabase Admin REST
// and inserts corresponding rows into `students` using the service role key.
// Usage:
//   SUPABASE_URL=https://<proj>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role_key> node import_students_direct.js path/to/file.csv

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

async function maybeFetch(url, opts) {
  if (typeof fetch === 'function') return fetch(url, opts)
  // Node older versions may not have fetch; try to require node-fetch
  try {
    const nf = require('node-fetch')
    return nf(url, opts)
  } catch (e) {
    throw new Error('No fetch available; please run on Node 18+ or install node-fetch')
  }
}

function parseLine(line) {
  const res = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) { res.push(cur); cur = '' } else { cur += ch }
  }
  res.push(cur)
  return res.map(s => s.trim())
}

function parseCSV(text) {
  const cleaned = text.replace(/\r/g, '')
  const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length === 0) return []
  const header = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseLine(line)
    const obj = {}
    header.forEach((h, i) => obj[h] = vals[i] ?? '')
    return obj
  })
}

async function main() {
  const csvPath = process.argv[2]
  if (!csvPath) { console.error('Usage: node import_students_direct.js path/to/file.csv'); process.exit(2) }
  const abs = path.resolve(csvPath)
  if (!fs.existsSync(abs)) { console.error('File not found:', abs); process.exit(2) }

  const SUPABASE_URL = process.env.SUPABASE_URL
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables')
    process.exit(2)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const csv = fs.readFileSync(abs, 'utf-8')
  const rows = parseCSV(csv)
  console.log(`Parsed ${rows.length} rows from ${abs}`)

  const results = []
  for (const row of rows) {
    const email = (row.email || '').trim()
    const reg_no = (row.reg_no || '').trim()
    const password = (row.password || '').trim() || null
    const name = row.name || null
    const year = row.year || null
    const semester = row.semester || null
    const section = row.section || null
    const department_id = row.department_id || null

    if (!email || !reg_no) {
      results.push({ email, ok: false, error: 'missing email or reg_no' })
      continue
    }

    let pw = password
    if (!pw) pw = Buffer.from(Math.random().toString()).toString('base64').slice(0,12) + 'A1!'

    try {
      const adminUrl = `${SUPABASE_URL}/auth/v1/admin/users`
      const body = { email, password: pw, user_metadata: { role: 'student', reg_no } }
      const resp = await maybeFetch(adminUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }, body: JSON.stringify(body)
      })
      const json = await resp.json().catch(()=>null)
      if (!resp.ok) {
        results.push({ email, ok: false, error: json?.msg ?? json ?? `admin create failed status ${resp.status}`, raw: json })
        continue
      }
      const userId = json?.id ?? json?.user?.id
      if (!userId) { results.push({ email, ok: false, error: 'no user id returned', raw: json }); continue }

      const { data, error } = await supabase.from('students').insert([{ user_id: userId, reg_no, name, year, semester, section, department_id, email }])
      if (error) { results.push({ email, ok: false, error: error.message, raw: json }); continue }

      results.push({ email, ok: true, user_id: userId, student: data?.[0] ?? null })
      console.log('Imported', email)
    } catch (e) {
      results.push({ email, ok: false, error: String(e) })
    }
  }

  const out = path.join(process.cwd(), 'import_results.json')
  fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf-8')
  console.log('Done. Wrote', out)
}

main().catch(err => { console.error(err); process.exit(1) })
