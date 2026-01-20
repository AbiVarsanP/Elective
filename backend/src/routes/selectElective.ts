import express from 'express'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()
const router = express.Router()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// POST /api/admin/select
// body: { elective_id: string, student_id: string }
// This endpoint must be called by backend (server-side) only. Frontend should call your authenticated backend.
router.post('/select', async (req, res) => {
  try{
    const { elective_id, student_id } = req.body
    if(!elective_id || !student_id) return res.status(400).json({ error: 'elective_id and student_id required' })

    // Call the RPC function created above using service role key
    const { data, error } = await supabase.rpc('select_elective', { p_elective_id: elective_id, p_student_id: student_id })
    if(error) return res.status(500).json({ error: error.message || error })

    // data is an array of rows from the function; pick first
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    if(!row) return res.status(500).json({ error: 'No response from RPC' })
    if(!row.success) return res.status(400).json({ success: false, message: row.message })

    return res.json({ success: true, registration_id: row.registration_id })
  }catch(e:any){
    console.error('selectElective error', e)
    return res.status(500).json({ error: e && e.message ? e.message : String(e) })
  }
})

export default router
