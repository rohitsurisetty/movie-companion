import React, { useState, useEffect } from 'react'
import {
  Search,
  Download,
  X,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Film,
  Shield,
  ShieldOff,
  Loader2,
  Globe,
  Heart,
} from 'lucide-react'
import { useDashboardStore, UserType } from '../store/dashboardStore'
import { format } from 'date-fns'

export const UsersTab: React.FC = () => {
  const { users, setUsers, setLoading, updateUser } = useDashboardStore()
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showBanModal, setShowBanModal] = useState<UserType | null>(null)
  const [banReason, setBanReason] = useState('')
  const perPage = 15

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

  const handleBanUser = async (userId: string, reason?: string) => {
    setActionLoading(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (res.ok) {
        const user = users.find((u) => u.user_id === userId)
        if (user) updateUser({ ...user, status: 'banned' })
        setShowBanModal(null)
        setBanReason('')
      }
    } catch (err) {
      console.error('Failed to ban user:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnbanUser = async (userId: string) => {
    setActionLoading(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/unban`, { method: 'POST' })
      if (res.ok) {
        const user = users.find((u) => u.user_id === userId)
        if (user) updateUser({ ...user, status: 'active' })
      }
    } catch (err) {
      console.error('Failed to unban user:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !search ||
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase()) ||
      user.phone?.includes(search) ||
      user.user_id.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const paginatedUsers = filteredUsers.slice((page - 1) * perPage, page * perPage)
  const totalPages = Math.ceil(filteredUsers.length / perPage)

  const exportCSV = () => {
    const headers = ['User ID', 'Name', 'Email', 'Phone', 'Gender', 'Age', 'Genres', 'Languages', 'Swipes', 'Status']
    const rows = filteredUsers.map((u) => [
      u.user_id,
      u.name || '',
      u.email || '',
      u.phone || '',
      u.gender || '',
      u.age || '',
      (u.genres || []).join('; '),
      (u.filmLanguages || []).join('; '),
      u.total_swipes || 0,
      u.status || 'active',
    ])
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `users_${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-gray-400 text-sm">{filteredUsers.length} users found</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 pl-9 pr-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg focus:outline-none focus:border-[#e50914] text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-sm focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
          </select>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg hover:bg-[#242424] transition-colors text-sm"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* User Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedUsers.map((user) => (
          <div
            key={user.user_id}
            onClick={() => setSelectedUser(user)}
            className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a] hover:border-[#333] transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-[#e50914] to-[#b30710] rounded-full flex items-center justify-center">
                  <span className="text-lg font-bold text-white">
                    {(user.name || 'U')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold">{user.name || 'Unknown'}</h3>
                  <p className="text-xs text-gray-500">
                    {user.gender && user.age ? `${user.gender}, ${user.age}` : user.gender || (user.age ? `${user.age} yrs` : 'No profile')}
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs ${
                user.status === 'banned' 
                  ? 'bg-red-500/10 text-red-400' 
                  : 'bg-green-500/10 text-green-400'
              }`}>
                {user.status || 'active'}
              </span>
            </div>

            {/* Contact Info */}
            <div className="space-y-2 mb-4">
              {user.email && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Mail size={14} />
                  <span className="truncate">{user.email}</span>
                </div>
              )}
              {user.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Phone size={14} />
                  <span>{user.phone}</span>
                </div>
              )}
            </div>

            {/* Movie Preferences */}
            {((user.genres && user.genres.length > 0) || (user.filmLanguages && user.filmLanguages.length > 0)) && (
              <div className="space-y-2 mb-4">
                {user.genres && user.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.genres.slice(0, 3).map((genre) => (
                      <span key={genre} className="px-2 py-0.5 bg-[#e50914]/10 text-[#e50914] rounded text-xs">
                        {genre}
                      </span>
                    ))}
                    {user.genres.length > 3 && (
                      <span className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">
                        +{user.genres.length - 3}
                      </span>
                    )}
                  </div>
                )}
                {user.filmLanguages && user.filmLanguages.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Globe size={12} />
                    <span>{user.filmLanguages.slice(0, 3).join(', ')}</span>
                    {user.filmLanguages.length > 3 && <span>+{user.filmLanguages.length - 3}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-between pt-3 border-t border-[#2a2a2a]">
              <div className="flex items-center gap-1 text-sm">
                <Film size={14} className="text-blue-400" />
                <span className="text-gray-400">{user.total_swipes || 0} swipes</span>
              </div>
              <div className="flex items-center gap-2">
                {user.status !== 'banned' ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowBanModal(user); }}
                    disabled={actionLoading === user.user_id}
                    className="p-1.5 hover:bg-red-500/10 rounded transition-colors"
                    title="Ban user"
                  >
                    {actionLoading === user.user_id ? (
                      <Loader2 size={16} className="text-red-400 animate-spin" />
                    ) : (
                      <ShieldOff size={16} className="text-red-400" />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUnbanUser(user.user_id); }}
                    disabled={actionLoading === user.user_id}
                    className="p-1.5 hover:bg-green-500/10 rounded transition-colors"
                    title="Unban user"
                  >
                    {actionLoading === user.user_id ? (
                      <Loader2 size={16} className="text-green-400 animate-spin" />
                    ) : (
                      <Shield size={16} className="text-green-400" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-[#1a1a1a] rounded-lg text-sm disabled:opacity-50 hover:bg-[#242424] transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="px-4 py-2 bg-[#1a1a1a] rounded-lg text-sm disabled:opacity-50 hover:bg-[#242424] transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* User Detail Drawer */}
      {selectedUser && (
        <UserDetailDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}

      {/* Ban Modal */}
      {showBanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowBanModal(null)} />
          <div className="relative bg-[#1a1a1a] rounded-xl p-6 w-full max-w-md border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ShieldOff className="text-red-400" size={20} />
              Ban User
            </h3>
            <p className="text-gray-400 mb-4">
              Ban <span className="font-medium text-white">{showBanModal.name || showBanModal.email}</span>?
            </p>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-3 py-2 bg-[#242424] border border-[#2a2a2a] rounded-lg focus:outline-none text-sm resize-none mb-4"
              rows={3}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowBanModal(null); setBanReason(''); }}
                className="px-4 py-2 bg-[#242424] rounded-lg hover:bg-[#2a2a2a] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleBanUser(showBanModal.user_id, banReason)}
                disabled={actionLoading === showBanModal.user_id}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {actionLoading === showBanModal.user_id ? <Loader2 size={16} className="animate-spin" /> : <ShieldOff size={16} />}
                Ban
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const UserDetailDrawer: React.FC<{ user: UserType; onClose: () => void }> = ({ user, onClose }) => (
  <div className="fixed inset-0 z-50 flex justify-end">
    <div className="absolute inset-0 bg-black/60" onClick={onClose} />
    <div className="relative w-full max-w-md bg-[#1a1a1a] h-full overflow-y-auto">
      <div className="sticky top-0 bg-[#1a1a1a] border-b border-[#2a2a2a] p-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">User Details</h2>
        <button onClick={onClose} className="p-2 hover:bg-[#242424] rounded-lg">
          <X size={20} />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* Profile Header */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-[#e50914] to-[#b30710] rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{(user.name || 'U')[0].toUpperCase()}</span>
          </div>
          <div>
            <h3 className="text-xl font-semibold">{user.name || 'No Name'}</h3>
            <p className="text-gray-500 text-sm font-mono">{user.user_id}</p>
          </div>
        </div>

        {/* Basic Info */}
        <div className="bg-[#242424] rounded-xl p-4 space-y-3">
          <h4 className="font-medium text-gray-400 text-sm">Basic Info</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Email</p>
              <p>{user.email || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Phone</p>
              <p>{user.phone || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Gender</p>
              <p>{user.gender || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Age</p>
              <p>{user.age ? `${user.age} years` : '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Location</p>
              <p>{user.location || user.city || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Joined</p>
              <p>{user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '—'}</p>
            </div>
          </div>
        </div>

        {/* Movie Preferences */}
        <div className="bg-[#242424] rounded-xl p-4 space-y-3">
          <h4 className="font-medium text-gray-400 text-sm">Movie Preferences</h4>
          <div className="space-y-3">
            <div>
              <p className="text-gray-500 text-xs mb-1">Favorite Genres</p>
              <div className="flex flex-wrap gap-1">
                {user.genres?.length ? user.genres.map((g) => (
                  <span key={g} className="px-2 py-0.5 bg-[#e50914]/10 text-[#e50914] rounded text-xs">{g}</span>
                )) : <span className="text-gray-500 text-sm">—</span>}
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Film Languages</p>
              <div className="flex flex-wrap gap-1">
                {user.filmLanguages?.length ? user.filmLanguages.map((l) => (
                  <span key={l} className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">{l}</span>
                )) : <span className="text-gray-500 text-sm">—</span>}
              </div>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">Top 5 Movies</p>
              <div className="space-y-1">
                {user.topMovies?.length ? user.topMovies.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Film size={12} className="text-gray-500" />
                    <span>{m.title}</span>
                  </div>
                )) : <span className="text-gray-500 text-sm">—</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Activity Stats */}
        <div className="bg-[#242424] rounded-xl p-4">
          <h4 className="font-medium text-gray-400 text-sm mb-3">Activity</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-[#1a1a1a] rounded-lg">
              <p className="text-2xl font-bold text-[#e50914]">{user.total_swipes || 0}</p>
              <p className="text-xs text-gray-500">Total Swipes</p>
            </div>
            <div className="text-center p-4 bg-[#1a1a1a] rounded-lg">
              <p className="text-2xl font-bold text-green-400">{user.total_matches || 0}</p>
              <p className="text-xs text-gray-500">Matches</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
)
