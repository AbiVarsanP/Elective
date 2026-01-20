import React from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Navbar({ role, email }: { role: string; email?: string | null }){
  const navigate = useNavigate()

  async function handleLogout(){
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  return (
    <header className="w-full bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="text-2xl font-semibold text-slate-800">Elective</div>
          <div className="text-sm text-slate-500">{role?.toUpperCase()}</div>
        </div>

        <div className="flex items-center space-x-4">
          {email && <div className="text-sm text-slate-600">{email}</div>}
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
