import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Navbar from '../components/Navbar'
import {
  BookOpen,
  Users,
  Download,
  Loader2,
  User,
  X
} from 'lucide-react'

export default function StaffDashboard() {
  const [name, setName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [electives, setElectives] = useState<any[]>([])
  const [loadingElectives, setLoadingElectives] = useState(false)
  const [electivesError, setElectivesError] = useState<string | null>(null)

  const [studentsModalOpen, setStudentsModalOpen] = useState(false)
  const [studentsModalLoading, setStudentsModalLoading] = useState(false)
  const [studentsModalError, setStudentsModalError] = useState<string | null>(null)
  const [studentsList, setStudentsList] = useState<any[]>([])

  async function authHeader() {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)
      const headers = await authHeader()
      const res = await fetch('/api/staff/profile', { headers })
      if (res.ok) {
        const data = await res.json()
        setName(data.name ?? null)
      }
      const session = (await supabase.auth.getSession()).data.session
      setEmail(session?.user.email ?? null)
      setLoading(false)
    }
    loadProfile()
  }, [])

  async function loadStaffElectives() {
    setLoadingElectives(true)
    setElectivesError(null)
    try {
      const headers = await authHeader()
      const res = await fetch('/api/staff/electives', { headers })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setElectives(json.electives ?? [])
    } catch (e: any) {
      setElectivesError(e.message)
    } finally {
      setLoadingElectives(false)
    }
  }

  async function loadElectiveStudents(electiveId: string) {
    setStudentsModalOpen(true)
    setStudentsModalLoading(true)
    setStudentsModalError(null)
    setStudentsList([])

    try {
      const headers = await authHeader()
      const res = await fetch(`/api/staff/electives/${electiveId}/students`, { headers })
      if (!res.ok) throw new Error(await res.text())
      const json = await res.json()
      setStudentsList(json.students ?? json)
    } catch (e: any) {
      setStudentsModalError(e.message)
    } finally {
      setStudentsModalLoading(false)
    }
  }

  async function downloadElectiveCSV(electiveId: string) {
    try {
      const headers = await authHeader()
      const res = await fetch(`/api/staff/electives/${electiveId}/download`, { headers })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `elective_${electiveId}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Failed to download CSV')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar role="staff" email={email} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Profile */}
        <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
            <User className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Welcome</p>
            <p className="text-lg font-semibold">
              {loading ? 'Loading…' : name ?? 'Staff'}
            </p>
          </div>
        </div>

        {/* Subjects */}
        <section className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold">Your Subjects</h2>
            </div>

            <button
              onClick={loadStaffElectives}
              disabled={loadingElectives}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded"
            >
              {loadingElectives ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BookOpen className="h-4 w-4" />
              )}
              Load
            </button>
          </div>

          {electivesError && (
            <p className="text-sm text-red-600">{electivesError}</p>
          )}

          <div className="space-y-3">
            {electives.map((e) => (
              <div
                key={e.id}
                className="border rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{e.subject_name}</p>
                  <p className="text-xs text-slate-500">
                    {e.subject_code} · Year {e.year} · Sem {e.semester}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => loadElectiveStudents(e.id)}
                    className="p-2 bg-indigo-600 text-white rounded"
                    title="View students"
                  >
                    <Users className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => downloadElectiveCSV(e.id)}
                    className="p-2 bg-slate-700 text-white rounded"
                    title="Download CSV"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Students Modal */}
      {studentsModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg w-11/12 max-w-3xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold">Registered Students</h3>
              <button onClick={() => setStudentsModalOpen(false)}>
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <div className="p-4 overflow-auto">
              {studentsModalLoading ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : studentsModalError ? (
                <p className="text-red-600">{studentsModalError}</p>
              ) : studentsList.length === 0 ? (
                <p className="text-slate-500">No students registered.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-2 py-1 text-left">Name</th>
                      <th className="px-2 py-1 text-left">Year</th>
                      <th className="px-2 py-1 text-left">Section</th>
                      <th className="px-2 py-1 text-left">Department</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentsList.map((s, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">{s.name ?? '-'}</td>
                        <td className="px-2 py-1">{s.year ?? '-'}</td>
                        <td className="px-2 py-1">{s.section ?? '-'}</td>
                        <td className="px-2 py-1">{s.department_name ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
