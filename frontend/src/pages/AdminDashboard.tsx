    import React, { useEffect, useState } from 'react'
    import { supabase } from '../supabaseClient'
    import Navbar from '../components/Navbar'
    import { RefreshCw, Plus, Download, Eye, Upload, Trash2, Play, Pause, X, FilePlus } from 'lucide-react'

    export default function AdminDashboard(){
    const [name, setName] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [email, setEmail] = useState<string | null>(null)

    useEffect(()=>{
        async function load(){
        setLoading(true)
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
        const res = await fetch(`${API_BASE}/api/admin/profile`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
        if(res.ok){
            const data = await res.json()
            setName(data.name ?? null)
        } else {
            setName(null)
        }
        const session = (await supabase.auth.getSession()).data.session
        setEmail(session?.user.email ?? null)
        setLoading(false)
        }
        load()
    },[])

    const [electives, setElectives] = useState<any[] | null>(null)
    const [loadingElectives, setLoadingElectives] = useState(false)
    const [electivesError, setElectivesError] = useState<string | null>(null)
    const [groupLoading, setGroupLoading] = useState<Record<string, boolean>>({})
    
    const [studentsModalOpen, setStudentsModalOpen] = useState(false)
    const [studentsModalLoading, setStudentsModalLoading] = useState(false)
    const [studentsModalError, setStudentsModalError] = useState<string | null>(null)
    const [studentsList, setStudentsList] = useState<any[] | null>(null)
    // create elective form state
    const [createYear, setCreateYear] = useState<number | null>(null)
    const [createSem, setCreateSem] = useState<number | null>(null)
    const [parentOptions, setParentOptions] = useState<any[] | null>(null)
    const [createParentId, setCreateParentId] = useState<string | null>(null)
    const [departments, setDepartments] = useState<any[] | null>(null)
    const [providingDept, setProvidingDept] = useState<string | null>(null)
    const [staffOptions, setStaffOptions] = useState<any[] | null>(null)
    const [assignedStaffId, setAssignedStaffId] = useState<string | null>(null)
    const [subjectName, setSubjectName] = useState('')
    const [subjectCode, setSubjectCode] = useState('')
    const [totalSeats, setTotalSeats] = useState<number>(0)
    const [blockedDepts, setBlockedDepts] = useState<Record<string, boolean>>({})
    const [creating, setCreating] = useState(false)
    const [electiveRows, setElectiveRows] = useState<any[]>([])
    const [csvFile, setCsvFile] = useState<File | null>(null)
    const [importPreviewRows, setImportPreviewRows] = useState<any[] | null>(null)
    const [importErrorsList, setImportErrorsList] = useState<string[] | null>(null)
    const [, setImportingCsv] = useState(false)
    const [staffAll, setStaffAll] = useState<any[] | null>(null)

    async function loadElectives(){
        setLoadingElectives(true)
        setElectivesError(null)
        try{
        const token = (await supabase.auth.getSession()).data.session?.access_token
            const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
            const res = await fetch(`${API_BASE}/api/admin/electives`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
        if(!res.ok){
            const txt = await res.text()
            throw new Error(txt || 'Failed to load electives')
        }
        const json = await res.json()
        setElectives(json.electives ?? [])
        }catch(err: any){
        setElectivesError(err.message ?? String(err))
        }finally{ setLoadingElectives(false) }
    }

    async function patchElective(id: string, action: 'activate'|'deactivate'|'polling-close'){
        setElectivesError(null)
        try{
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
        const res = await fetch(`${API_BASE}/api/admin/electives/${id}/${action}`, {
            method: 'PATCH',
            headers: ({ Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' } as HeadersInit)
        })
        if(!res.ok){
            const txt = await res.text()
            throw new Error(txt || 'Failed')
        }
        const json = await res.json()
        const updated = json.elective
        // update local state
        setElectives(prev => (prev ?? []).map((it:any)=> it.id === updated.id ? updated : it))
        }catch(err: any){
        setElectivesError(err.message ?? String(err))
        }
    }

    async function patchGroup(parent: string, action: 'activate'|'deactivate'|'polling-close'){
        setElectivesError(null)
        try{
        setGroupLoading(prev => ({ ...prev, [parent]: true }))
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
        const encoded = encodeURIComponent(parent)
        const res = await fetch(`${API_BASE}/api/admin/electives/group/${encoded}/${action}`, {
            method: 'PATCH',
            headers: ({ Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' } as HeadersInit)
        })
        if(!res.ok){
            const txt = await res.text()
            throw new Error(txt || 'Failed')
        }
        const json = await res.json()
        const updatedList = json.electives ?? []
        // merge updates into local electives
        setElectives(prev => {
            const map = new Map((prev ?? []).map((e:any)=>[e.id,e]))
            for(const u of updatedList) map.set(u.id, u)
            return Array.from(map.values())
        })
        }catch(err: any){
        setElectivesError(err.message ?? String(err))
        } finally { setGroupLoading(prev => ({ ...prev, [parent]: false })) }
    }

    async function loadElectiveStudents(electiveId: string){
        setStudentsModalError(null)
        setStudentsList(null)
        setStudentsModalLoading(true)
        setStudentsModalOpen(true)
        try{
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
        const res = await fetch(`${API_BASE}/api/admin/electives/${encodeURIComponent(electiveId)}/students`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
        if(!res.ok){
            const txt = await res.text()
            throw new Error(txt || 'Failed to load students')
        }
        const json = await res.json()
        setStudentsList(json.students ?? json)
        }catch(err: any){
        setStudentsModalError(err.message ?? String(err))
        }finally{ setStudentsModalLoading(false) }
    }

    function parseLine(line: string) {
        const res: string[] = []
        let cur = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
            cur += '"'
            i++
            } else {
            inQuotes = !inQuotes
            }
        } else if (ch === ',' && !inQuotes) {
            res.push(cur)
            cur = ''
        } else {
            cur += ch
        }
        }
        res.push(cur)
        return res.map(s => s.trim())
    }

    function parseCSV(text: string) {
        const cleaned = text.replace(/\r/g, '')
        const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        if (lines.length === 0) return []
        const header = parseLine(lines[0])
        const rows = lines.slice(1).map(line => {
        const vals = parseLine(line)
        const obj: any = {}
        header.forEach((h, i) => { obj[h] = vals[i] ?? '' })
        return obj
        })
        return rows
    }

    // Year -> sem mapping
    const yearToSem = (y:number|null) => {
        if(y === 1) return [1,2]
        if(y === 2) return [3,4]
        if(y === 3) return [5,6]
        if(y === 4) return [7,8]
        return []
    }

    function shortDeptName(name: string){
        if(!name) return ''
        const parts = name.split(/\s+/).filter(Boolean)
        if(parts.length === 1) return parts[0].slice(0,6)
        return parts.map(p=>p[0].toUpperCase()).join('')
    }

    async function loadCreateMeta(){
        try{
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
        // departments
        const dres = await fetch(`${API_BASE}/api/admin/departments`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
        if(dres.ok){ const jd = await dres.json(); setDepartments(jd.departments ?? []) }
        // parent options for selected year/sem
        if(createYear && createSem){
            const pres = await fetch(`${API_BASE}/api/admin/parent_electives?year=${createYear}&sem=${createSem}`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
            if(pres.ok){ const pj = await pres.json(); setParentOptions(pj.parent_electives ?? []) }
        } else setParentOptions([])
            // staff options for providingDept
        if(providingDept){
            const sres = await fetch(`${API_BASE}/api/admin/staff?department_id=${encodeURIComponent(providingDept)}`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
            if(sres.ok){ const sj = await sres.json(); setStaffOptions(sj.staff ?? []) }
        } else setStaffOptions([])
            // also fetch all staff for CSV import mapping if not loaded
            if(!staffAll){
                const allRes = await fetch(`${API_BASE}/api/admin/staff`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
                if(allRes.ok){ const aj = await allRes.json(); setStaffAll(aj.staff ?? []) }
            }
        }catch(e){ console.error('loadCreateMeta failed', e) }
    }

    React.useEffect(()=>{ loadCreateMeta() }, [createYear, createSem, providingDept])

    function toggleBlocked(deptId:string){
        setBlockedDepts(prev => ({ ...prev, [deptId]: !prev[deptId] }))
    }

    async function addRow(){
        if(!subjectName || !subjectCode || !providingDept) return alert('Subject, code and providing department required for row')
        setElectiveRows(prev => [...prev, { subject_name: subjectName, subject_code: subjectCode, providing_department_id: providingDept, total_seats: totalSeats, staff_id: assignedStaffId, parent_elective_id: createParentId, subject_year: createYear, subject_semester: createSem }])
        setSubjectName(''); setSubjectCode(''); setTotalSeats(0); setAssignedStaffId(null)
    }

    async function createElectives(){
        if(electiveRows.length === 0) return alert('Add at least one elective row')
        setCreating(true)
        try{
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
        const blocked = Object.entries(blockedDepts).filter(([,v])=>v).map(([k])=>k)
        const body = { parent_elective_id: createParentId, rows: electiveRows, blocked_department_ids: blocked }
        const res = await fetch(`${API_BASE}/api/admin/electives/bulk`, { method: 'POST', headers: ({ Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' } as HeadersInit), body: JSON.stringify(body) })
        if(!res.ok) throw new Error(await res.text())
        const j = await res.json()
        // merge created electives
        setElectives(prev => [...(j.created ?? []), ...(prev ?? [])])
        if(j.errors && j.errors.length > 0) console.warn('Some rows failed', j.errors)
        setElectiveRows([])
        setSubjectName(''); setSubjectCode(''); setTotalSeats(0); setBlockedDepts({}); setAssignedStaffId(null)
        alert('Electives created')
        }catch(err:any){ alert('Create failed: '+String(err)) }
        finally{ setCreating(false) }
    }

        // group electives by parent name for display
    const grouped = (electives ?? []).reduce((acc: Record<string, any[]>, e)=>{
        const key = e.parent_electives?.name ?? 'Other'
        if(!acc[key]) acc[key] = []
        acc[key].push(e)
        return acc
    }, {})

    return (
        <div className="min-h-screen bg-slate-50">
        <Navbar role="admin" email={email} />
        <main className="w-full p-6">
            <div className="space-y-6">
                {/* Welcome card */}
                <section className="bg-white rounded-xl shadow p-6 w-full">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold">Admin dashboard</h1>
                            {loading ? (
                                <p className="text-sm text-slate-500">Loading profile...</p>
                            ) : (
                                <p className="text-lg text-slate-700">Welcome, {name ?? 'Admin'}!</p>
                            )}
                            <p className="mt-2 text-sm text-slate-500">Heavy data loads lazily after initial render.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={loadElectives} disabled={loadingElectives} title="Load electives" className="p-2 bg-blue-600 text-white rounded-md">
                                <RefreshCw className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                    {electivesError && <div className="mt-3 text-red-600 text-sm">{electivesError}</div>}
                </section>

                {/* Create Elective card */}
                <section className="bg-white rounded-xl shadow p-6 w-full">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-medium">Create Elective</h3>
                        <div className="text-sm text-slate-500">Add multiple rows then create</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                        <label className="block text-sm">Year</label>
                        <select className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={createYear ?? ''} onChange={e=> setCreateYear(e.target.value ? Number(e.target.value) : null)}>
                            <option value="">Select year</option>
                            <option value={1}>1</option>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                            <option value={4}>4</option>
                        </select>
                        </div>
                        <div>
                        <label className="block text-sm">Semester</label>
                        <select className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={createSem ?? ''} onChange={e=> setCreateSem(e.target.value ? Number(e.target.value) : null)}>
                            <option value="">Select sem</option>
                            {yearToSem(createYear).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        </div>
                        <div>
                        <label className="block text-sm">Parent Elective</label>
                        <select className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={createParentId ?? ''} onChange={e=> setCreateParentId(e.target.value || null)}>
                            <option value="">(none)</option>
                            {(parentOptions ?? []).map(p => <option key={p.id} value={p.id}>{p.name} ({p.year}/{p.sem})</option>)}
                        </select>
                        </div>
                        <div>
                        <label className="block text-sm">Providing Department</label>
                        <select className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={providingDept ?? ''} onChange={e=> { setProvidingDept(e.target.value || null); /* auto select blocked */ }}>
                            <option value="">Select dept</option>
                            {(departments ?? []).map(d => <option key={d.id} value={d.id}>{shortDeptName(d.name)} — {d.name}</option>)}
                        </select>
                        </div>
                        <div>
                        <label className="block text-sm">Staff (from department)</label>
                        <select className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={assignedStaffId ?? ''} onChange={e=> setAssignedStaffId(e.target.value || null)}>
                            <option value="">(none)</option>
                            {(staffOptions ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        </div>
                        <div>
                        <label className="block text-sm">Seats</label>
                        <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" type="number" value={totalSeats} onChange={e=> setTotalSeats(Number(e.target.value))} />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm">Subject name</label>
                        <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={subjectName} onChange={e=> setSubjectName(e.target.value)} />
                        </div>
                        <div>
                        <label className="block text-sm">Subject code</label>
                        <input className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" value={subjectCode} onChange={e=> setSubjectCode(e.target.value)} />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm">Block for departments</label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {(departments ?? []).map(d => (
                            <label key={d.id} className="inline-flex items-center gap-2 text-sm bg-gray-50 px-2 py-1 rounded">
                                <input type="checkbox" checked={!!blockedDepts[d.id]} onChange={()=> toggleBlocked(d.id)} /> <span className="ml-1">{shortDeptName(d.name)} — {d.name}</span>
                            </label>
                            ))}
                        </div>
                        </div>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                        <button onClick={addRow} disabled={creating} title="Add row" className="p-2 bg-green-600 text-white rounded">
                            <Plus className="h-5 w-5" />
                        </button>
                        <button onClick={createElectives} disabled={creating || electiveRows.length===0} title="Create electives" className="p-2 bg-blue-600 text-white rounded">
                            <FilePlus className="h-5 w-5" />
                        </button>
                        <button onClick={()=>{ setSubjectName(''); setSubjectCode(''); setTotalSeats(0); setBlockedDepts({}); setElectiveRows([]) }} title="Reset" className="p-2 bg-gray-200 rounded">
                            <X className="h-5 w-5" />
                        </button>
                        <div className="ml-auto flex items-center gap-2">
                            <button title="Download template" onClick={async ()=>{ try{ const token = (await supabase.auth.getSession()).data.session?.access_token; const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''; const res = await fetch(`${API_BASE}/api/admin/subjects/template.xlsx`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) }); if(!res.ok) throw new Error(await res.text()); const blob = await res.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `subject_import_template.xlsx`; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); }catch(err){ console.error(err); alert('Failed to download template: '+ String(err)) } }} className="p-2 bg-indigo-600 text-white rounded">
                                <Download className="h-4 w-4" />
                            </button>
                            <input id="file-input" className="hidden" type="file" accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=> setCsvFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                            <label htmlFor="file-input" title="Choose file" className="p-2 bg-emerald-600 text-white rounded cursor-pointer">
                                <Upload className="h-4 w-4" />
                            </label>
                            <button onClick={async ()=>{ if(!csvFile) return alert('Select a file first'); setImportErrorsList(null); setImportPreviewRows(null); try{ let rows:any[] = []; if(csvFile.name.toLowerCase().endsWith('.xlsx')){ const token = (await supabase.auth.getSession()).data.session?.access_token; const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''; const fd = new FormData(); fd.append('file', csvFile); const res = await fetch(`${API_BASE}/api/admin/subjects/parse`, { method: 'POST', headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit), body: fd }); if(!res.ok) throw new Error(await res.text()); const j = await res.json(); rows = j.rows ?? [] } else { const txt = await csvFile.text(); rows = parseCSV(txt) } const deptMap = new Map((departments ?? []).map(d=>[String(d.name).toLowerCase(), d.id])); const staffMap = new Map((staffAll ?? []).map(s=>[String(s.name).toLowerCase(), s.id])); const preview:any[] = []; const errs:string[] = []; for(const r of rows){ const subject_name = (r['subject_name'] || r['subject name'] || r['subjec name'] || r['subject'] || '').trim(); const subject_code = (r['subject_code'] || r['subject code'] || r['code'] || '').trim(); const providing_department = (r['providing_department'] || r['department'] || r['providing department'] || '').trim(); const staff_name = (r['staff_name'] || r['staff name'] || r['staff'] || '').trim(); const total_seats = Number(r['total_seats'] || r['seats'] || r['seat_count'] || r['total seats'] || 0); if(!subject_name || !subject_code || !providing_department){ errs.push('Missing required columns in a row: subject_name/subject_code/providing_department'); continue } const deptId = deptMap.get(providing_department.toLowerCase()) ?? Array.from(deptMap.entries()).find(([k])=> providing_department.toLowerCase().includes(k))?.[1] ?? null; const staffId = staffMap.get(staff_name.toLowerCase()) ?? null; if(!deptId) errs.push(`Department not found: ${providing_department}`); if(staff_name && !staffId) errs.push(`Staff not found: ${staff_name}`); preview.push({ subject_name, subject_code, providing_department_id: deptId, staff_id: staffId, total_seats, parent_elective_id: createParentId, subject_year: createYear, subject_semester: createSem }) } setImportPreviewRows(preview); setImportErrorsList(errs.length>0?errs:null) }catch(e:any){ console.error(e); alert('Failed to parse file: '+ String(e)) } }} className="p-2 bg-emerald-600 text-white rounded" title="Preview file">
                                <Eye className="h-4 w-4" />
                            </button>
                            <button onClick={async ()=>{ if(!importPreviewRows || importPreviewRows.length === 0) return alert('No preview rows to import'); setImportingCsv(true); try{ const token = (await supabase.auth.getSession()).data.session?.access_token; const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''; const rowsToSend = importPreviewRows.map((r:any)=> ({ subject_name: r.subject_name, subject_code: r.subject_code, providing_department_id: r.providing_department_id, total_seats: r.total_seats, staff_id: r.staff_id })); const res = await fetch(`${API_BASE}/api/admin/electives/bulk`, { method: 'POST', headers: ({ Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' } as HeadersInit), body: JSON.stringify({ parent_elective_id: createParentId, rows: rowsToSend }) }); if(!res.ok) throw new Error(await res.text()); const j = await res.json(); setElectives(prev => [...(j.created ?? []), ...(prev ?? [])]); if(j.errors && j.errors.length>0) setImportErrorsList((j.errors as any).map((e:any)=> JSON.stringify(e))); else setImportErrorsList(null); setImportPreviewRows(null); setCsvFile(null); alert('CSV import complete') }catch(e:any){ console.error(e); alert('Import failed: '+ String(e)) } finally{ setImportingCsv(false) } }} title="Import previewed rows" className="p-2 bg-blue-700 text-white rounded">
                                <Upload className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                                        {/* CSV bulk import */}
                                        <div className="mt-4 border-t pt-3">
                                            <div className="flex items-center gap-3">
                                                <button onClick={async ()=>{
                                                    try{
                                                        const token = (await supabase.auth.getSession()).data.session?.access_token
                                                        const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
                                                        const res = await fetch(`${API_BASE}/api/admin/subjects/template.xlsx`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
                                                        if(!res.ok) throw new Error(await res.text())
                                                        const blob = await res.blob()
                                                        const url = window.URL.createObjectURL(blob)
                                                        const a = document.createElement('a')
                                                        a.href = url
                                                        a.download = `subject_import_template.xlsx`
                                                        document.body.appendChild(a)
                                                        a.click()
                                                        a.remove()
                                                        window.URL.revokeObjectURL(url)
                                                    }catch(err){ console.error(err); alert('Failed to download template: '+ String(err)) }
                                                }} className="px-3 py-2 bg-indigo-600 text-white rounded">Download CSV template</button>
                                                <input type="file" accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=> setCsvFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
                                                <button onClick={async ()=>{
                                                    if(!csvFile) return alert('Select a file first')
                                                    setImportErrorsList(null)
                                                    setImportPreviewRows(null)
                                                    try{
                                                        let rows:any[] = []
                                                        if(csvFile.name.toLowerCase().endsWith('.xlsx')){
                                                            const token = (await supabase.auth.getSession()).data.session?.access_token
                                                            const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
                                                            const fd = new FormData(); fd.append('file', csvFile)
                                                            const res = await fetch(`${API_BASE}/api/admin/subjects/parse`, { method: 'POST', headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit), body: fd })
                                                            if(!res.ok) throw new Error(await res.text())
                                                            const j = await res.json(); rows = j.rows ?? []
                                                        } else {
                                                            const txt = await csvFile.text(); rows = parseCSV(txt)
                                                        }
                                                        // map department and staff names
                                                        const deptMap = new Map((departments ?? []).map(d=>[String(d.name).toLowerCase(), d.id]))
                                                        const staffMap = new Map((staffAll ?? []).map(s=>[String(s.name).toLowerCase(), s.id]))
                                                        const preview:any[] = []
                                                        const errs:string[] = []
                                                        for(const r of rows){
                                                            const subject_name = (r['subject_name'] || r['subject name'] || r['subjec name'] || r['subject'] || '').trim()
                                                            const subject_code = (r['subject_code'] || r['subject code'] || r['code'] || '').trim()
                                                            const providing_department = (r['providing_department'] || r['department'] || r['providing department'] || '').trim()
                                                            const staff_name = (r['staff_name'] || r['staff name'] || r['staff'] || '').trim()
                                                            const total_seats = Number(r['total_seats'] || r['seats'] || r['seat_count'] || r['total seats'] || 0)
                                                            if(!subject_name || !subject_code || !providing_department){ errs.push('Missing required columns in a row: subject_name/subject_code/providing_department'); continue }
                                                            const deptId = deptMap.get(providing_department.toLowerCase()) ?? Array.from(deptMap.entries()).find(([k])=> providing_department.toLowerCase().includes(k))?.[1] ?? null
                                                            const staffId = staffMap.get(staff_name.toLowerCase()) ?? null
                                                            if(!deptId) errs.push(`Department not found: ${providing_department}`)
                                                            if(staff_name && !staffId) errs.push(`Staff not found: ${staff_name}`)
                                                            preview.push({ subject_name, subject_code, providing_department_id: deptId, staff_id: staffId, total_seats, parent_elective_id: createParentId, subject_year: createYear, subject_semester: createSem })
                                                        }
                                                        setImportPreviewRows(preview)
                                                        setImportErrorsList(errs.length>0?errs:null)
                                                    }catch(e:any){ console.error(e); alert('Failed to parse file: '+ String(e)) }
                                                }} className="px-3 py-2 bg-emerald-600 text-white rounded">Preview File</button>
                                                <button onClick={async ()=>{
                                                    if(!importPreviewRows || importPreviewRows.length === 0) return alert('No preview rows to import')
                                                    setImportingCsv(true)
                                                    try{
                                                        const token = (await supabase.auth.getSession()).data.session?.access_token
                                                        const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
                                                        // filter out rows missing dept id
                                                        const rowsToSend = importPreviewRows.map((r:any)=> ({ subject_name: r.subject_name, subject_code: r.subject_code, providing_department_id: r.providing_department_id, total_seats: r.total_seats, staff_id: r.staff_id }))
                                                        const res = await fetch(`${API_BASE}/api/admin/electives/bulk`, { method: 'POST', headers: ({ Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' } as HeadersInit), body: JSON.stringify({ parent_elective_id: createParentId, rows: rowsToSend }) })
                                                        if(!res.ok) throw new Error(await res.text())
                                                        const j = await res.json()
                                                        setElectives(prev => [...(j.created ?? []), ...(prev ?? [])])
                                                        if(j.errors && j.errors.length>0) setImportErrorsList((j.errors as any).map((e:any)=> JSON.stringify(e)))
                                                        else setImportErrorsList(null)
                                                        setImportPreviewRows(null)
                                                        setCsvFile(null)
                                                        alert('CSV import complete')
                                                    }catch(e:any){ console.error(e); alert('Import failed: '+ String(e)) }
                                                    finally{ setImportingCsv(false) }
                                                }} className="px-3 py-2 bg-blue-700 text-white rounded">Import Previewed Rows</button>
                                            </div>
                                            {importErrorsList && <div className="mt-2 text-sm text-red-600">{importErrorsList.map((er,i)=> <div key={i}>{er}</div>)}</div>}
                                            {importPreviewRows && importPreviewRows.length > 0 && (
                                                <div className="mt-2">
                                                    <h4 className="text-sm font-medium">Preview ({importPreviewRows.length})</h4>
                                                    <ul className="mt-2 space-y-1 text-sm">
                                                        {importPreviewRows.map((r:any, i)=> (
                                                            <li key={i} className="p-2 bg-gray-50 rounded">{r.subject_code} — {r.subject_name} <span className="text-xs text-slate-500">({departments?.find(d=>d.id===r.providing_department_id)?.name ?? 'DEPT?'}{r.staff_id ? ' — '+(staffAll?.find(s=>s.id===r.staff_id)?.name ?? '') : ''})</span></li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                    {electiveRows.length > 0 && (
                        <div className="mt-3">
                        <h4 className="text-sm font-medium">Pending rows</h4>
                        <ul className="mt-2 space-y-2">
                            {electiveRows.map((r, idx) => (
                            <li key={idx} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                                <div className="text-sm">{r.subject_code} — {r.subject_name} <span className="text-xs text-slate-500">({shortDeptName(departments?.find(d=>d.id===r.providing_department_id)?.name ?? '')} {departments?.find(d=>d.id===r.providing_department_id)?.name ? '— '+departments?.find(d=>d.id===r.providing_department_id)?.name : ''})</span></div>
                                <div className="flex gap-2">
                                <button onClick={()=> setElectiveRows(prev => prev.filter((_,i)=> i!==idx))} className="p-2 bg-red-500 text-white rounded" title="Remove row"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            </li>
                            ))}
                        </ul>
                        </div>
                    )}
                    </section>
                    {Object.keys(grouped).map(parent => (
                    <section key={parent} className="bg-slate-50 p-4 rounded-md">
                        <div className="flex items-center justify-between">
                        <h2 className="text-lg font-medium">{parent} <span className="text-sm text-slate-500">({grouped[parent].length})</span></h2>
                        <div className="flex items-center gap-3">
                            <div className="text-sm text-slate-500">Showing {grouped[parent].length} electives</div>
                            <div className="flex items-center gap-2">
                            <button title="Download CSV" onClick={async () => {
                                try{
                                    const token = (await supabase.auth.getSession()).data.session?.access_token
                                    const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''
                                    const enc = encodeURIComponent(parent)
                                    const res = await fetch(`${API_BASE}/api/admin/electives/group/${enc}/download`, { headers: ({ Authorization: token ? `Bearer ${token}` : '' } as HeadersInit) })
                                    if(!res.ok) throw new Error(await res.text())
                                    const blob = await res.blob()
                                    const url = window.URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url
                                    a.download = `electives_${parent}_students.csv`
                                    document.body.appendChild(a)
                                    a.click()
                                    a.remove()
                                    window.URL.revokeObjectURL(url)
                                }catch(err){
                                    console.error(err)
                                    alert('Failed to download CSV: '+ String(err))
                                }
                                }} className="p-2 bg-gray-700 text-white rounded">
                                <Download className="h-4 w-4" />
                            </button>
                            <button title="Activate all" onClick={async ()=> await patchGroup(parent,'activate')} disabled={loadingElectives || !!groupLoading[parent]} className={`px-3 py-2 rounded flex items-center gap-2 ${groupLoading[parent] ? 'opacity-50 cursor-not-allowed bg-gray-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                                <Play className="h-4 w-4" /> Activate
                            </button>

                            <button title="Deactivate all" onClick={async ()=> await patchGroup(parent,'deactivate')} disabled={loadingElectives || !!groupLoading[parent]} className={`px-3 py-2 rounded flex items-center gap-2 ${groupLoading[parent] ? 'opacity-50 cursor-not-allowed bg-gray-200' : 'bg-yellow-500 text-white hover:bg-yellow-600'}`}>
                                <Pause className="h-4 w-4" /> Deactivate
                            </button>

                            <button title="Close polling" onClick={async ()=> await patchGroup(parent,'polling-close')} disabled={loadingElectives || !!groupLoading[parent]} className={`px-3 py-2 rounded flex items-center gap-2 ${groupLoading[parent] ? 'opacity-50 cursor-not-allowed bg-gray-200' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                <X className="h-4 w-4" /> Close Poll
                            </button>
                            </div>
                        </div>
                        </div>

                        <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm border-collapse bg-white">
                            <thead>
                            <tr className="text-left text-slate-600">
                                <th className="pb-2">Code</th>
                                <th className="pb-2">Name</th>
                                <th className="pb-2">Year</th>
                                <th className="pb-2">Sem</th>
                                <th className="pb-2">Seats</th>
                                <th className="pb-2">Filled</th>
                                <th className="pb-2">Active</th>
                            </tr>
                            </thead>
                            <tbody>
                            {grouped[parent].map((e:any) => (
                                <tr key={e.id} className="border-t border-slate-100">
                                <td className="py-2">{e.subject_code}</td>
                                <td className="py-2">{e.subject_name}</td>
                                <td className="py-2">{e.parent_electives?.year ?? '-'}</td>
                                <td className="py-2">{e.parent_electives?.sem ?? '-'}</td>
                                <td className="py-2">{e.total_seats}</td>
                                <td className="py-2">{e.filled_seats}</td>
                                <td className="py-2">{e.is_active ? 'Yes' : 'No'}</td>
                                <td className="py-2">
                                    <div className="flex gap-2">
                                    {e.is_active ? (
                                        <button onClick={async ()=> await patchElective(e.id,'deactivate')} title="Deactivate" className="px-3 py-2 rounded flex items-center gap-2 bg-yellow-500 text-white">
                                            <Pause className="h-4 w-4" /> Deactivate
                                        </button>
                                    ) : (
                                        <button onClick={async ()=> await patchElective(e.id,'activate')} title="Activate" className="px-3 py-2 rounded flex items-center gap-2 bg-green-600 text-white">
                                            <Play className="h-4 w-4" /> Activate
                                        </button>
                                    )}

                                    {!e.polling_closed && (
                                        <button onClick={async ()=> await patchElective(e.id,'polling-close')} title="Close polling" className="px-3 py-2 rounded flex items-center gap-2 bg-blue-600 text-white">
                                            <X className="h-4 w-4" /> Close Poll
                                        </button>
                                    )}

                                    <button onClick={async () => await loadElectiveStudents(e.id)} title="List students" className="p-2 bg-indigo-600 text-white rounded">
                                        <Eye className="h-4 w-4" />
                                    </button>
                                    </div>
                                </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                        </div>
                    </section>
                    
                    ))}
                </div>

            {/* Import Students section removed per request */}

            {/* Students list modal */}
            {studentsModalOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-lg w-11/12 max-w-3xl p-4">
                    <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-medium">Students for subject</h3>
                    <div className="flex items-center gap-2">
                        <button className="px-3 py-1 bg-gray-200 rounded" onClick={() => setStudentsModalOpen(false)}>Close</button>
                    </div>
                    </div>
                    {studentsModalLoading ? (
                    <p>Loading...</p>
                    ) : studentsModalError ? (
                    <div className="text-red-600">{studentsModalError}</div>
                    ) : !studentsList || studentsList.length === 0 ? (
                    <p>No students found for this subject.</p>
                    ) : (
                    <div className="overflow-x-auto max-h-96">
                        <table className="min-w-full text-sm">
                        <thead className="bg-gray-100">
                            <tr>
                            <th className="px-2 py-1 text-left">Name</th>
                            <th className="px-2 py-1 text-left">Year</th>
                            <th className="px-2 py-1 text-left">Section</th>
                            <th className="px-2 py-1 text-left">Department</th>
                            </tr>
                        </thead>
                        <tbody>
                            {studentsList.map((s:any, idx:number) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-2 py-1">{s.name ?? s.student_name ?? '-'}</td>
                                <td className="px-2 py-1">{s.year ?? '-'}</td>
                                <td className="px-2 py-1">{s.section ?? '-'}</td>
                                <td className="px-2 py-1">{s.department ?? s.department_name ?? '-'}</td>
                            </tr>
                            ))}
                        </tbody>
                        </table>
                    </div>
                    )}
                </div>
                </div>
            )}
        </main>
        </div>
    )
    }
