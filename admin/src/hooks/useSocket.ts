import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useDashboardStore } from '../store/dashboardStore'
import { useAuthStore } from '../store/authStore'

export const useSocket = () => {
  const socketRef = useRef<Socket | null>(null)
  const { token } = useAuthStore()
  const {
    setMetrics,
    addUser,
    updateUser,
    addSwipe,
    addMatch,
    setConnected,
    addActivity,
  } = useDashboardStore()

  useEffect(() => {
    if (!token) return

    const socket = io('/', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('WebSocket connected')
      setConnected(true)
    })

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected')
      setConnected(false)
    })

    socket.on('metrics_update', (data) => {
      setMetrics(data)
    })

    socket.on('new_user', (user) => {
      addUser(user)
      addActivity({ type: 'new_user', data: user, timestamp: new Date().toISOString() })
    })

    socket.on('user_updated', (user) => {
      updateUser(user)
      addActivity({ type: 'user_updated', data: user, timestamp: new Date().toISOString() })
    })

    socket.on('new_swipe', (swipe) => {
      addSwipe(swipe)
      addActivity({ type: 'new_swipe', data: swipe, timestamp: new Date().toISOString() })
    })

    socket.on('new_match', (match) => {
      addMatch(match)
      addActivity({ type: 'new_match', data: match, timestamp: new Date().toISOString() })
    })

    return () => {
      socket.disconnect()
    }
  }, [token])

  return socketRef.current
}
