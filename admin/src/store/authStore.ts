import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Admin {
  id: string
  email: string
  name: string
  role: 'super_admin' | 'admin' | 'moderator'
}

interface AuthState {
  admin: Admin | null
  token: string | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
}

const API_URL = '/api'

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      admin: null,
      token: null,
      isAuthenticated: false,
      login: async (email: string, password: string) => {
        try {
          const res = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          if (!res.ok) return false
          const data = await res.json()
          set({
            admin: data.admin,
            token: data.token,
            isAuthenticated: true,
          })
          return true
        } catch {
          return false
        }
      },
      logout: () => {
        set({ admin: null, token: null, isAuthenticated: false })
      },
    }),
    { name: 'admin-auth' }
  )
)
