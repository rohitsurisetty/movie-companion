import React, { useState, useEffect } from 'react'
import {
  Search,
  ThumbsUp,
  ThumbsDown,
  Star,
  ChevronDown,
  ChevronRight,
  Film,
  User,
  Calendar,
  Filter,
} from 'lucide-react'
import { useDashboardStore, SwipeType } from '../store/dashboardStore'
import { format } from 'date-fns'

interface GroupedSwipes {
  [userId: string]: {
    user_name: string
    swipes: SwipeType[]
    likes: number
    dislikes: number
  }
}

export const SwipesTab: React.FC = () => {
  const { swipes, setSwipes, setLoading } = useDashboardStore()
  const [search, setSearch] = useState('')
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [directionFilter, setDirectionFilter] = useState<'all' | 'right' | 'left'>('all')

  useEffect(() => {
    fetchSwipes()
  }, [])

  const fetchSwipes = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/swipes?limit=1000')
      if (res.ok) {
        const data = await res.json()
        setSwipes(data.swipes)
      }
    } catch (err) {
      console.error('Failed to fetch swipes:', err)
    } finally {
      setLoading(false)
    }
  }

  // Group swipes by user
  const groupedSwipes: GroupedSwipes = swipes
    .filter((s) => {
      const matchesSearch =
        !search ||
        s.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.user_id.toLowerCase().includes(search.toLowerCase()) ||
        s.movie_title?.toLowerCase().includes(search.toLowerCase())
      const matchesDirection = directionFilter === 'all' || s.direction === directionFilter
      return matchesSearch && matchesDirection
    })
    .reduce((acc, swipe) => {
      if (!acc[swipe.user_id]) {
        acc[swipe.user_id] = {
          user_name: swipe.user_name || swipe.user_id,
          swipes: [],
          likes: 0,
          dislikes: 0,
        }
      }
      acc[swipe.user_id].swipes.push(swipe)
      if (swipe.direction === 'right') {
        acc[swipe.user_id].likes++
      } else {
        acc[swipe.user_id].dislikes++
      }
      return acc
    }, {} as GroupedSwipes)

  const toggleExpand = (userId: string) => {
    const next = new Set(expandedUsers)
    if (next.has(userId)) {
      next.delete(userId)
    } else {
      next.add(userId)
    }
    setExpandedUsers(next)
  }

  const totalSwipes = swipes.length
  const totalLikes = swipes.filter((s) => s.direction === 'right').length
  const totalDislikes = swipes.filter((s) => s.direction === 'left').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Movie Swipes</h1>
          <p className="text-[var(--text-secondary)]">
            {totalSwipes} total swipes ({totalLikes} likes, {totalDislikes} passes)
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by user or movie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:border-[var(--accent)] text-sm"
            />
          </div>
          {/* Direction Filter */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as any)}
            className="px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Swipes</option>
            <option value="right">Likes Only</option>
            <option value="left">Passes Only</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--accent)]/10 rounded-lg">
              <Film className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalSwipes}</p>
              <p className="text-sm text-[var(--text-secondary)]">Total Swipes</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--success)]/10 rounded-lg">
              <ThumbsUp className="w-5 h-5 text-[var(--success)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalLikes}</p>
              <p className="text-sm text-[var(--text-secondary)]">Likes</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--error)]/10 rounded-lg">
              <ThumbsDown className="w-5 h-5 text-[var(--error)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalDislikes}</p>
              <p className="text-sm text-[var(--text-secondary)]">Passes</p>
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Swipes */}
      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="divide-y divide-[var(--border-color)]">
          {Object.entries(groupedSwipes).length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)]">
              No swipes found. Swipes will appear here as users interact.
            </div>
          ) : (
            Object.entries(groupedSwipes).map(([userId, data]) => (
              <div key={userId}>
                {/* User Row */}
                <div
                  onClick={() => toggleExpand(userId)}
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedUsers.has(userId) ? (
                      <ChevronDown size={16} className="text-[var(--text-muted)]" />
                    ) : (
                      <ChevronRight size={16} className="text-[var(--text-muted)]" />
                    )}
                    <div className="w-8 h-8 bg-[var(--accent)]/20 rounded-full flex items-center justify-center">
                      <User size={14} className="text-[var(--accent)]" />
                    </div>
                    <div>
                      <p className="font-medium">{data.user_name}</p>
                      <p className="text-xs text-[var(--text-muted)] font-mono">{userId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-sm text-[var(--success)]">
                      <ThumbsUp size={14} /> {data.likes}
                    </span>
                    <span className="flex items-center gap-1 text-sm text-[var(--error)]">
                      <ThumbsDown size={14} /> {data.dislikes}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">
                      {data.swipes.length} total
                    </span>
                  </div>
                </div>

                {/* Expanded Swipes */}
                {expandedUsers.has(userId) && (
                  <div className="bg-[var(--bg-card)] border-t border-[var(--border-color)]">
                    <div className="divide-y divide-[var(--border-color)]">
                      {data.swipes.slice(0, 50).map((swipe, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-4 py-3 pl-12"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`p-2 rounded-lg ${
                                swipe.direction === 'right'
                                  ? 'bg-[var(--success)]/10'
                                  : 'bg-[var(--error)]/10'
                              }`}
                            >
                              {swipe.direction === 'right' ? (
                                <ThumbsUp size={14} className="text-[var(--success)]" />
                              ) : (
                                <ThumbsDown size={14} className="text-[var(--error)]" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{swipe.movie_title}</p>
                              {swipe.rating && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  {[...Array(5)].map((_, i) => (
                                    <Star
                                      key={i}
                                      size={12}
                                      className={i < swipe.rating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}
                                    />
                                  ))}
                                </div>
                              )}
                              {swipe.reason && (
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                  "{swipe.reason}"
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-[var(--text-muted)]">
                              {swipe.created_at
                                ? format(new Date(swipe.created_at), 'MMM d, h:mm a')
                                : '—'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
