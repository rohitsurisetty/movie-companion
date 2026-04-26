import React, { useState, useEffect } from 'react'
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  X,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Film,
  Heart,
  Clock,
  MoreVertical,
  Ban,
  CheckCircle,
  Eye,
} from 'lucide-react'
import { useDashboardStore, UserType } from '../store/dashboardStore'
import { format } from 'date-fns'

export const UsersTab: React.FC = () => {
  const { users, setUsers, setLoading } = useDashboardStore()
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<keyof UserType>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const perPage = 20

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users
    .filter((user) => {
      const matchesSearch =
        !search ||
        user.name?.toLowerCase().includes(search.toLowerCase()) ||
        user.email?.toLowerCase().includes(search.toLowerCase()) ||
        user.phone?.includes(search) ||
        user.user_id.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => {
      const aVal = a[sortField] || ''
      const bVal = b[sortField] || ''
      if (sortDir === 'asc') return aVal > bVal ? 1 : -1
      return aVal < bVal ? 1 : -1
    })

  const paginatedUsers = filteredUsers.slice((page - 1) * perPage, page * perPage)
  const totalPages = Math.ceil(filteredUsers.length / perPage)

  const exportCSV = () => {
    const headers = ['User ID', 'Name', 'Email', 'Phone', 'Gender', 'Age', 'Location', 'Status', 'Signup Date']
    const rows = filteredUsers.map((u) => [
      u.user_id,
      u.name || '',
      u.email || '',
      u.phone || '',
      u.gender || '',
      u.age || '',
      u.location || '',
      u.status,
      u.created_at,
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `users_${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
  }

  const toggleSort = (field: keyof UserType) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }: { field: keyof UserType }) => {
    if (sortField !== field) return null
    return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-[var(--text-secondary)]">
            {filteredUsers.length} users found
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search by name, email, phone, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64 pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:border-[var(--accent)] text-sm"
            />
          </div>
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="banned">Banned</option>
          </select>
          {/* Export */}
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors text-sm"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[var(--bg-card)]">
              <tr>
                <th
                  onClick={() => toggleSort('user_id')}
                  className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    User ID <SortIcon field="user_id" />
                  </div>
                </th>
                <th
                  onClick={() => toggleSort('name')}
                  className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    Name <SortIcon field="name" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">
                  Location
                </th>
                <th
                  onClick={() => toggleSort('created_at')}
                  className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)] cursor-pointer hover:text-white"
                >
                  <div className="flex items-center gap-1">
                    Joined <SortIcon field="created_at" />
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {paginatedUsers.map((user) => (
                <tr
                  key={user.user_id}
                  className="hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  onClick={() => setSelectedUser(user)}
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-[var(--text-muted)]">
                      {user.user_id.slice(0, 16)}...
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[var(--accent)]/20 rounded-full flex items-center justify-center">
                        <User size={16} className="text-[var(--accent)]" />
                      </div>
                      <div>
                        <p className="font-medium">{user.name || 'No name'}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {user.gender}, {user.age || '?'} yrs
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {user.email && (
                        <p className="text-sm flex items-center gap-1">
                          <Mail size={12} className="text-[var(--text-muted)]" />
                          {user.email}
                        </p>
                      )}
                      {user.phone && (
                        <p className="text-sm flex items-center gap-1">
                          <Phone size={12} className="text-[var(--text-muted)]" />
                          {user.phone}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm">{user.location || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm">
                      {user.created_at
                        ? format(new Date(user.created_at), 'MMM d, yyyy')
                        : '—'}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        user.status === 'active'
                          ? 'bg-[var(--success)]/10 text-[var(--success)]'
                          : user.status === 'banned'
                          ? 'bg-[var(--error)]/10 text-[var(--error)]'
                          : 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
                      }`}
                    >
                      {user.status === 'active' && <CheckCircle size={12} />}
                      {user.status === 'banned' && <Ban size={12} />}
                      {user.status || 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedUser(user)
                      }}
                      className="p-2 hover:bg-[var(--bg-card)] rounded-lg transition-colors"
                    >
                      <Eye size={16} className="text-[var(--text-secondary)]" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
          <p className="text-sm text-[var(--text-secondary)]">
            Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, filteredUsers.length)} of{' '}
            {filteredUsers.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-[var(--bg-card)] rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-hover)] transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-[var(--text-secondary)]">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 bg-[var(--bg-card)] rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-hover)] transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* User Detail Drawer */}
      {selectedUser && (
        <UserDetailDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  )
}

interface UserDetailDrawerProps {
  user: UserType
  onClose: () => void
}

const UserDetailDrawer: React.FC<UserDetailDrawerProps> = ({ user, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[var(--bg-secondary)] h-full overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">User Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-hover)] rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Profile Header */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-[var(--accent)]/20 rounded-full flex items-center justify-center">
              <User size={32} className="text-[var(--accent)]" />
            </div>
            <div>
              <h3 className="text-xl font-semibold">{user.name || 'No Name'}</h3>
              <p className="text-[var(--text-muted)] text-sm font-mono">{user.user_id}</p>
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-[var(--bg-card)] rounded-xl p-4 space-y-3">
            <h4 className="font-medium text-[var(--text-secondary)]">Basic Information</h4>
            <div className="grid grid-cols-2 gap-4">
              <InfoItem icon={<Mail size={14} />} label="Email" value={user.email || '—'} />
              <InfoItem icon={<Phone size={14} />} label="Phone" value={user.phone || '—'} />
              <InfoItem icon={<User size={14} />} label="Gender" value={user.gender || '—'} />
              <InfoItem icon={<Calendar size={14} />} label="Age" value={user.age ? `${user.age} years` : '—'} />
              <InfoItem icon={<MapPin size={14} />} label="Location" value={user.location || '—'} />
              <InfoItem
                icon={<Calendar size={14} />}
                label="Joined"
                value={user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—'}
              />
            </div>
          </div>

          {/* Movie Preferences */}
          <div className="bg-[var(--bg-card)] rounded-xl p-4 space-y-3">
            <h4 className="font-medium text-[var(--text-secondary)]">Movie Preferences</h4>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">Favorite Genres</p>
                <div className="flex flex-wrap gap-2">
                  {user.genres?.map((genre) => (
                    <span
                      key={genre}
                      className="px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] rounded-full text-xs"
                    >
                      {genre}
                    </span>
                  )) || <span className="text-[var(--text-muted)]">—</span>}
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">Film Languages</p>
                <div className="flex flex-wrap gap-2">
                  {user.filmLanguages?.map((lang) => (
                    <span
                      key={lang}
                      className="px-2 py-1 bg-[var(--info)]/10 text-[var(--info)] rounded-full text-xs"
                    >
                      {lang}
                    </span>
                  )) || <span className="text-[var(--text-muted)]">—</span>}
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">Top 5 Movies</p>
                <div className="space-y-1">
                  {user.topMovies?.map((movie, idx) => (
                    <p key={idx} className="text-sm flex items-center gap-2">
                      <Film size={12} className="text-[var(--text-muted)]" />
                      {movie.title}
                    </p>
                  )) || <span className="text-[var(--text-muted)]">—</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Activity Stats */}
          <div className="bg-[var(--bg-card)] rounded-xl p-4 space-y-3">
            <h4 className="font-medium text-[var(--text-secondary)]">Activity</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-[var(--bg-secondary)] rounded-lg">
                <p className="text-2xl font-bold text-[var(--accent)]">{user.total_swipes || 0}</p>
                <p className="text-xs text-[var(--text-muted)]">Total Swipes</p>
              </div>
              <div className="text-center p-3 bg-[var(--bg-secondary)] rounded-lg">
                <p className="text-2xl font-bold text-[var(--success)]">{user.total_matches || 0}</p>
                <p className="text-xs text-[var(--text-muted)]">Matches</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const InfoItem: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div>
    <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mb-1">
      {icon} {label}
    </p>
    <p className="text-sm">{value}</p>
  </div>
)
