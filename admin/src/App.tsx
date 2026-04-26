import React, { useState, useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import { useDashboardStore } from './store/dashboardStore'
import { useSocket } from './hooks/useSocket'
import { Layout } from './components/Layout'
import { Login } from './components/Login'
import { OverviewTab } from './components/OverviewTab'
import { UsersTab } from './components/UsersTab'
import { SwipesTab } from './components/SwipesTab'
import { MatchesTab } from './components/MatchesTab'
import { AnalyticsTab } from './components/AnalyticsTab'
import { ReportsTab } from './components/ReportsTab'
import './index.css'

function App() {
  const { isAuthenticated } = useAuthStore()
  const { setMetrics, setUsers, setSwipes, setMatches, setLoading } = useDashboardStore()
  const [activeTab, setActiveTab] = useState('overview')

  // Initialize WebSocket connection
  useSocket()

  // Fetch initial data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchInitialData()
    }
  }, [isAuthenticated])

  const fetchInitialData = async () => {
    setLoading(true)
    try {
      const [metricsRes, usersRes, swipesRes, matchesRes] = await Promise.all([
        fetch('/api/admin/metrics'),
        fetch('/api/admin/users'),
        fetch('/api/admin/swipes?limit=500'),
        fetch('/api/admin/matches'),
      ])

      if (metricsRes.ok) {
        const data = await metricsRes.json()
        setMetrics(data)
      }
      if (usersRes.ok) {
        const data = await usersRes.json()
        setUsers(data.users)
      }
      if (swipesRes.ok) {
        const data = await swipesRes.json()
        setSwipes(data.swipes)
      }
      if (matchesRes.ok) {
        const data = await matchesRes.json()
        setMatches(data.matches)
      }
    } catch (err) {
      console.error('Failed to fetch initial data:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'swipes' && <SwipesTab />}
      {activeTab === 'matches' && <MatchesTab />}
      {activeTab === 'analytics' && <AnalyticsTab />}
      {activeTab === 'reports' && <ReportsTab />}
    </Layout>
  )
}

export default App
