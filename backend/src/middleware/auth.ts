import { Request, Response, NextFunction } from 'express'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export type UserPayload = { id: string, role?: string, user_metadata?: any }

export async function verifyJwtMiddleware(req: Request, res: Response, next: NextFunction){
  const auth = req.headers.authorization
  if(!auth){
    console.log('[auth] no Authorization header on request', req.method, req.path)
    return next()
  }
  const parts = auth.split(' ')
  const token = parts.length === 2 ? parts[1] : parts[0]

  if(!token){
    console.warn('[auth] Authorization header present but token empty')
    return res.status(401).json({ error: 'Invalid token' })
  }

  try{
    const display = token.length > 20 ? `${token.slice(0,10)}...len=${token.length}` : token
    console.log('[auth] verifying token via supabase', display)

    // Use Supabase Admin client to validate token and retrieve user data
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if(error){
      console.error('[auth] supabase.auth.getUser error', error.message)
      return res.status(401).json({ error: 'Invalid token', details: error.message })
    }

    const payload = data?.user ?? null
    if(!payload) return res.status(401).json({ error: 'Invalid token' })
    ;(req as any)._supabase_jwt = payload
    return next()
  }catch(err){
    console.error('[auth] token verification failed', (err as any)?.message ?? err)
    return res.status(401).json({ error: 'Invalid token', details: (err as any)?.message ?? String(err) })
  }
}

export function attachUser(req: Request, _res: Response, next: NextFunction){
  const payload = (req as any)._supabase_jwt as any | undefined
  if(!payload) return next()
  // Supabase stores user id in 'sub' or 'user_id' claim depending on setup
  const id = payload.sub ?? payload.user_id ?? payload?.id
  const role = payload.user_metadata?.role ?? payload.role
  ;(req as any).user = { id, role }
  next()
}

function ensureRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as UserPayload | undefined
    if(!user) return res.status(401).json({ error: 'Missing user token' })
    if(!user.role || !roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden' })
    return next()
  }
}

export const requireAdmin = ensureRole(['admin'])
export const requireStaff = ensureRole(['staff', 'admin'])
export const requireStudent = ensureRole(['student'])
