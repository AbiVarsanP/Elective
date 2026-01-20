import { LogOut } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useState } from 'react'

export default function Navbar({
  role,
  email
}: {
  role: string
  email: string | null
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    setLoggingOut(true)
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <>
      <nav className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div>
          <p className="font-semibold capitalize">{role} Dashboard</p>
          <p className="text-xs text-slate-500 hidden sm:block">{email}</p>
        </div>

        {/* Logout icon */}
        <button
          onClick={() => setShowConfirm(true)}
          className="p-2 rounded-full hover:bg-slate-100 text-slate-600"
          title="Logout"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </nav>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-5 w-[90%] max-w-sm space-y-4">
            <h3 className="text-lg font-semibold">Confirm logout</h3>
            <p className="text-sm text-slate-600">
              Are you sure you want to log out?
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm rounded bg-slate-100"
              >
                Cancel
              </button>

              <button
                onClick={logout}
                disabled={loggingOut}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white disabled:opacity-50"
              >
                {loggingOut ? 'Logging out…' : 'Logout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
