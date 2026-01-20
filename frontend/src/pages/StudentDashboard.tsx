import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import Navbar from '../components/Navbar'
import {
  BookOpen,
  CheckCircle,
  Lock,
  Loader2,
  User,
  AlertTriangle,
  Bug
} from 'lucide-react'

export default function StudentDashboard() {
  const [name, setName] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [electives, setElectives] = useState<any[]>([])
  const [loadingElectives, setLoadingElectives] = useState(false)
  const [electivesError, setElectivesError] = useState<string | null>(null)

  const [selectedElectiveId, setSelectedElectiveId] = useState<string | null>(null)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null)

  const [debugInfo, setDebugInfo] = useState<any | null>(null)

  const API_BASE = (import.meta.env.VITE_API_URL as string) ?? ''

  async function authHeader() {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  useEffect(() => {
    async function loadProfile() {
      setLoading(true)

      const headers = await authHeader()
      const res = await fetch(`${API_BASE}/api/student/profile`, { headers })
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

  useEffect(() => {
    async function loadElectives() {
      setLoadingElectives(true)
      setElectivesError(null)

      try {
        const headers = await authHeader()
        const res = await fetch(`${API_BASE}/api/student/electives`, { headers })
        if (!res.ok) throw new Error(await res.text())

        const json = await res.json()
        setElectives(json.electives ?? [])

        if (json.registeredElectiveId) {
          setSelectedElectiveId(json.registeredElectiveId)
          setAlreadyRegistered(true)
        }
      } catch (e: any) {
        setElectivesError(e.message)
      } finally {
        setLoadingElectives(false)
      }
    }

    loadElectives()
  }, [])

  async function register() {
    if (!selectedElectiveId) return
    setRegistering(true)
    setRegistrationMessage(null)

    try {
      const headers = {
        ...(await authHeader()),
        'Content-Type': 'application/json'
      }

      const res = await fetch(`${API_BASE}/api/student/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ elective_id: selectedElectiveId })
      })

      const json = await res.json()
      setRegistrationMessage(json?.result?.message ?? json?.error)
      if (res.ok) setAlreadyRegistered(true)
    } catch (e: any) {
      setRegistrationMessage(e.message)
    } finally {
      setRegistering(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar role="student" email={email} />

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow p-5 flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center">
            <User className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Welcome</p>
            <p className="text-lg font-semibold">
              {loading ? 'Loading...' : name ?? 'Student'}
            </p>
          </div>
        </div>

        {/* Electives Section */}
        <section className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Electives</h2>
          </div>

          {loadingElectives && (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="animate-spin h-4 w-4" />
              Loading electives…
            </div>
          )}

          {electivesError && (
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              {electivesError}
            </div>
          )}

          {!loadingElectives && electives.length === 0 && (
            <p className="text-sm text-slate-500">No active electives</p>
          )}

          <div className="space-y-3">
            {electives.map((e) => {
              const isSelected = selectedElectiveId === e.id
              const disabled = alreadyRegistered || e.is_full

              return (
                <div
                  key={e.id}
                  className={`border rounded-lg p-4 flex items-center justify-between
                    ${isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}
                    ${disabled ? 'opacity-60' : ''}`}
                >
                  <div>
                    <p className="font-medium">{e.subject_name}</p>
                    <p className="text-xs text-slate-500">
                      {e.subject_code} · {e.filled_seats}/{e.total_seats} seats
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {e.is_full && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                        Full
                      </span>
                    )}

                    <input
                      type="radio"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => setSelectedElectiveId(e.id)}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Action */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={register}
              disabled={!selectedElectiveId || alreadyRegistered || registering}
              className="flex items-center gap-2 px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50"
            >
              {registering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : alreadyRegistered ? (
                <Lock className="h-4 w-4" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {alreadyRegistered ? 'Locked' : 'Confirm'}
            </button>

            {registrationMessage && (
              <p className="text-sm text-slate-600">{registrationMessage}</p>
            )}
          </div>
        </section>

        {/* Debug */}
        <section className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center gap-2 mb-2">
            <Bug className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-medium">Debug</h3>
          </div>

          <button
            onClick={async () => {
              const headers = await authHeader()
              const res = await fetch(`${API_BASE}/api/debug/me`, { headers })
              setDebugInfo(await res.json())
            }}
            className="text-xs px-3 py-1 bg-slate-700 text-white rounded"
          >
            Fetch
          </button>

          {debugInfo && (
            <pre className="mt-3 text-xs bg-slate-100 p-3 rounded overflow-auto">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          )}
        </section>
      </main>
    </div>
  )
}
