import React, { useState, useEffect } from 'react'
import {
  Heart,
  Users,
  TrendingUp,
  Calendar,
  Search,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { useDashboardStore, MatchType } from '../store/dashboardStore'
import { format } from 'date-fns'

export const MatchesTab: React.FC = () => {
  const { matches, setMatches, setLoading } = useDashboardStore()
  const [search, setSearch] = useState('')
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null)

  useEffect(() => {
    fetchMatches()
  }, [])

  const fetchMatches = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/matches')
      if (res.ok) {
        const data = await res.json()
        setMatches(data.matches)
      }
    } catch (err) {
      console.error('Failed to fetch matches:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredMatches = matches.filter(
    (m) =>
      !search ||
      m.user1_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.user2_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.user1_id.includes(search) ||
      m.user2_id.includes(search)
  )

  // Calculate stats
  const totalMatches = matches.length
  const matchesToday = matches.filter((m) => {
    if (!m.matched_at) return false
    const matchDate = new Date(m.matched_at)
    const today = new Date()
    return matchDate.toDateString() === today.toDateString()
  }).length
  const avgCompatibility =
    matches.length > 0
      ? Math.round(
          matches.reduce((acc, m) => acc + (m.compatibility_score || 75), 0) / matches.length
        )
      : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Matches</h1>
          <p className="text-[var(--text-secondary)]">
            {totalMatches} total matches on the platform
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search matches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:border-[var(--accent)] text-sm"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--error)]/10 rounded-lg">
              <Heart className="w-5 h-5 text-[var(--error)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalMatches}</p>
              <p className="text-sm text-[var(--text-secondary)]">Total Matches</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--success)]/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-[var(--success)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{matchesToday}</p>
              <p className="text-sm text-[var(--text-secondary)]">Matches Today</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--warning)]/10 rounded-lg">
              <Sparkles className="w-5 h-5 text-[var(--warning)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{avgCompatibility}%</p>
              <p className="text-sm text-[var(--text-secondary)]">Avg Compatibility</p>
            </div>
          </div>
        </div>
      </div>

      {/* Matches List */}
      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-color)]">
          <h3 className="font-semibold">Recent Matches</h3>
        </div>
        <div className="divide-y divide-[var(--border-color)]">
          {filteredMatches.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)]">
              <Heart className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No matches yet. Matches will appear here when users connect.</p>
            </div>
          ) : (
            filteredMatches.slice(0, 50).map((match, idx) => (
              <div
                key={match._id || idx}
                className="p-4 hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {/* User 1 */}
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-[var(--info)]/20 rounded-full flex items-center justify-center">
                        <Users size={16} className="text-[var(--info)]" />
                      </div>
                      <div>
                        <p className="font-medium">{match.user1_name || 'User 1'}</p>
                        <p className="text-xs text-[var(--text-muted)] font-mono">
                          {match.user1_id.slice(0, 12)}...
                        </p>
                      </div>
                    </div>

                    {/* Heart Icon */}
                    <div className="p-2 bg-[var(--error)]/10 rounded-full">
                      <Heart className="w-5 h-5 text-[var(--error)] fill-[var(--error)]" />
                    </div>

                    {/* User 2 */}
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-[var(--success)]/20 rounded-full flex items-center justify-center">
                        <Users size={16} className="text-[var(--success)]" />
                      </div>
                      <div>
                        <p className="font-medium">{match.user2_name || 'User 2'}</p>
                        <p className="text-xs text-[var(--text-muted)] font-mono">
                          {match.user2_id.slice(0, 12)}...
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {match.compatibility_score && (
                      <p className="text-sm font-medium text-[var(--success)]">
                        {match.compatibility_score}% Compatible
                      </p>
                    )}
                    <p className="text-xs text-[var(--text-muted)]">
                      {match.matched_at
                        ? format(new Date(match.matched_at), 'MMM d, yyyy h:mm a')
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
