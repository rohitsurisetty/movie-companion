import React, { useState, useEffect } from 'react'
import {
  Flag,
  AlertTriangle,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  User,
  MessageSquare,
  Eye,
  Ban,
  Search,
} from 'lucide-react'
import { format } from 'date-fns'

interface Report {
  id: string
  reporter_id: string
  reporter_name: string
  reported_id: string
  reported_name: string
  reason: string
  description: string
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
  created_at: string
}

export const ReportsTab: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/reports')
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports)
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      !search ||
      r.reporter_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.reported_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.reason.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const pendingCount = reports.filter((r) => r.status === 'pending').length
  const reviewedCount = reports.filter((r) => r.status === 'reviewed').length
  const resolvedCount = reports.filter((r) => r.status === 'resolved').length

  const updateStatus = async (reportId: string, status: string) => {
    try {
      await fetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: status as any } : r))
      )
    } catch (err) {
      console.error('Failed to update report:', err)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-[var(--warning)]/10 text-[var(--warning)] rounded-full text-xs">
            <Clock size={12} /> Pending
          </span>
        )
      case 'reviewed':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-[var(--info)]/10 text-[var(--info)] rounded-full text-xs">
            <Eye size={12} /> Reviewed
          </span>
        )
      case 'resolved':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-[var(--success)]/10 text-[var(--success)] rounded-full text-xs">
            <CheckCircle size={12} /> Resolved
          </span>
        )
      case 'dismissed':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-[var(--text-muted)]/10 text-[var(--text-muted)] rounded-full text-xs">
            <XCircle size={12} /> Dismissed
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports & Moderation</h1>
          <p className="text-[var(--text-secondary)]">
            Manage user reports and flagged content
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:border-[var(--accent)] text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--error)]/10 rounded-lg">
              <Flag className="w-5 h-5 text-[var(--error)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{reports.length}</p>
              <p className="text-sm text-[var(--text-secondary)]">Total Reports</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--warning)]/10 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingCount}</p>
              <p className="text-sm text-[var(--text-secondary)]">Pending Review</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--info)]/10 rounded-lg">
              <Eye className="w-5 h-5 text-[var(--info)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{reviewedCount}</p>
              <p className="text-sm text-[var(--text-secondary)]">Under Review</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--success)]/10 rounded-lg">
              <Shield className="w-5 h-5 text-[var(--success)]" />
            </div>
            <div>
              <p className="text-2xl font-bold">{resolvedCount}</p>
              <p className="text-sm text-[var(--text-secondary)]">Resolved</p>
            </div>
          </div>
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-color)]">
          <h3 className="font-semibold">Moderation Queue</h3>
        </div>
        <div className="divide-y divide-[var(--border-color)]">
          {filteredReports.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)]">
              <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No reports to review. The platform is clean!</p>
            </div>
          ) : (
            filteredReports.map((report) => (
              <div key={report.id} className="p-4 hover:bg-[var(--bg-hover)] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(report.status)}
                      <span className="text-sm text-[var(--text-muted)]">
                        {format(new Date(report.created_at), 'MMM d, yyyy h:mm a')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex items-center gap-1 text-sm">
                        <User size={14} className="text-[var(--text-muted)]" />
                        <span className="font-medium">{report.reporter_name}</span>
                      </div>
                      <span className="text-[var(--text-muted)]">→</span>
                      <div className="flex items-center gap-1 text-sm">
                        <span className="font-medium text-[var(--error)]">
                          {report.reported_name}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">Reason:</span> {report.reason}
                    </p>
                    {report.description && (
                      <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {report.description}
                      </p>
                    )}
                  </div>
                  {report.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateStatus(report.id, 'reviewed')}
                        className="p-2 hover:bg-[var(--info)]/10 rounded-lg transition-colors"
                        title="Mark as reviewed"
                      >
                        <Eye size={18} className="text-[var(--info)]" />
                      </button>
                      <button
                        onClick={() => updateStatus(report.id, 'resolved')}
                        className="p-2 hover:bg-[var(--success)]/10 rounded-lg transition-colors"
                        title="Resolve"
                      >
                        <CheckCircle size={18} className="text-[var(--success)]" />
                      </button>
                      <button
                        onClick={() => updateStatus(report.id, 'dismissed')}
                        className="p-2 hover:bg-[var(--text-muted)]/10 rounded-lg transition-colors"
                        title="Dismiss"
                      >
                        <XCircle size={18} className="text-[var(--text-muted)]" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
