import { create } from 'zustand'

export interface DashboardMetrics {
  totalUsers: number
  activeToday: number
  dau: number
  wau: number
  mau: number
  newSignupsToday: number
  totalMatches: number
  totalSwipesToday: number
  avgSessionDuration: number
  subscriptionRate: number
  retentionRate: number
  genderDistribution: { male: number; female: number; other: number }
}

export interface UserType {
  user_id: string
  name: string
  email: string
  phone?: string
  gender?: string
  age?: number
  location?: string
  city?: string
  created_at: string
  last_active?: string
  status: 'active' | 'inactive' | 'banned'
  subscription?: string
  genres?: string[]
  filmLanguages?: string[]
  topMovies?: any[]
  total_swipes?: number
  total_matches?: number
  has_profile?: boolean
}

export interface SwipeType {
  _id?: string
  user_id: string
  user_name?: string
  movie_id: number
  movie_title: string
  direction: 'right' | 'left'
  rating?: number
  reason?: string
  created_at: string
}

export interface MatchType {
  _id?: string
  user1_id: string
  user1_name?: string
  user2_id: string
  user2_name?: string
  matched_at: string
  compatibility_score?: number
}

interface DashboardState {
  metrics: DashboardMetrics | null
  users: UserType[]
  swipes: SwipeType[]
  matches: MatchType[]
  recentActivity: any[]
  isLoading: boolean
  isConnected: boolean
  setMetrics: (metrics: DashboardMetrics) => void
  setUsers: (users: UserType[]) => void
  addUser: (user: UserType) => void
  updateUser: (user: UserType) => void
  setSwipes: (swipes: SwipeType[]) => void
  addSwipe: (swipe: SwipeType) => void
  setMatches: (matches: MatchType[]) => void
  addMatch: (match: MatchType) => void
  setLoading: (loading: boolean) => void
  setConnected: (connected: boolean) => void
  addActivity: (activity: any) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  metrics: null,
  users: [],
  swipes: [],
  matches: [],
  recentActivity: [],
  isLoading: true,
  isConnected: false,
  setMetrics: (metrics) => set({ metrics }),
  setUsers: (users) => set({ users }),
  addUser: (user) => set((state) => ({ users: [user, ...state.users] })),
  updateUser: (user) => set((state) => ({
    users: state.users.map((u) => (u.user_id === user.user_id ? user : u)),
  })),
  setSwipes: (swipes) => set({ swipes }),
  addSwipe: (swipe) => set((state) => ({ swipes: [swipe, ...state.swipes].slice(0, 1000) })),
  setMatches: (matches) => set({ matches }),
  addMatch: (match) => set((state) => ({ matches: [match, ...state.matches] })),
  setLoading: (isLoading) => set({ isLoading }),
  setConnected: (isConnected) => set({ isConnected }),
  addActivity: (activity) => set((state) => ({
    recentActivity: [activity, ...state.recentActivity].slice(0, 100),
  })),
}))
