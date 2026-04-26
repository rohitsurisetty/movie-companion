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
  Filter,
  ChevronDown,
  Briefcase,
  GraduationCap,
  Wine,
  Cigarette,
  Dumbbell,
  Dog,
  Plane,
  Users,
  Star,
} from 'lucide-react'
import { useDashboardStore, UserType } from '../store/dashboardStore'
import { format } from 'date-fns'

export const UsersTab: React.FC = () => {
  const { users, setUsers, setLoading, updateUser } = useDashboardStore()
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [genreFilter, setGenreFilter] = useState<string>('all')
  const [languageFilter, setLanguageFilter] = useState<string>('all')
  const [genderFilter, setGenderFilter] = useState<string>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showBanModal, setShowBanModal] = useState<UserType | null>(null)
  const [banReason, setBanReason] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const perPage = 12

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

  // Get unique values for filters
  const allGenres = [...new Set(users.flatMap(u => u.genres || []))].sort()
  const allLanguages = [...new Set(users.flatMap(u => u.filmLanguages || []))].sort()
  const allGenders = [...new Set(users.map(u => u.gender).filter(Boolean))].sort()

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      !search ||
      user.name?.toLowerCase().includes(search.toLowerCase()) ||
      user.email?.toLowerCase().includes(search.toLowerCase()) ||
      user.phone?.includes(search) ||
      user.user_id.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter
    const matchesGenre = genreFilter === 'all' || (user.genres || []).includes(genreFilter)
    const matchesLanguage = languageFilter === 'all' || (user.filmLanguages || []).includes(languageFilter)
    const matchesGender = genderFilter === 'all' || user.gender === genderFilter
    return matchesSearch && matchesStatus && matchesGenre && matchesLanguage && matchesGender
  })

  const paginatedUsers = filteredUsers.slice((page - 1) * perPage, page * perPage)
  const totalPages = Math.ceil(filteredUsers.length / perPage)

  const exportCSV = () => {
    const headers = ['User ID', 'Name', 'Email', 'Phone', 'Gender', 'Age', 'Location', 'Genres', 'Languages', 'Top Movies', 'Relationship Intent', 'Swipes', 'Status']
    const rows = filteredUsers.map((u) => [
      u.user_id,
      u.name || '',
      u.email || '',
      u.phone || '',
      u.gender || '',
      u.age || '',
      u.location || u.city || '',
      (u.genres || []).join('; '),
      (u.filmLanguages || []).join('; '),
      (u.topMovies || []).map((m: any) => m.title).join('; '),
      (u.relationshipIntent || []).join('; '),
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

  const clearFilters = () => {
    setStatusFilter('all')
    setGenreFilter('all')
    setLanguageFilter('all')
    setGenderFilter('all')
    setSearch('')
  }

  const activeFiltersCount = [statusFilter, genreFilter, languageFilter, genderFilter].filter(f => f !== 'all').length

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-gray-400 text-sm">{filteredUsers.length} of {users.length} users</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              showFilters || activeFiltersCount > 0 
                ? 'bg-[#e50914] text-white' 
                : 'bg-[#1a1a1a] border border-[#2a2a2a] hover:bg-[#242424]'
            }`}
          >
            <Filter size={16} />
            Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg hover:bg-[#242424] transition-colors text-sm"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-[#1a1a1a] rounded-xl p-4 border border-[#2a2a2a]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Filter Users</h3>
            {activeFiltersCount > 0 && (
              <button onClick={clearFilters} className="text-sm text-[#e50914] hover:underline">
                Clear all filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#242424] border border-[#2a2a2a] rounded-lg text-sm focus:outline-none"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="banned">Banned</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Gender</label>
              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#242424] border border-[#2a2a2a] rounded-lg text-sm focus:outline-none"
              >
                <option value="all">All Genders</option>
                {allGenders.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Genre Preference</label>
              <select
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#242424] border border-[#2a2a2a] rounded-lg text-sm focus:outline-none"
              >
                <option value="all">All Genres</option>
                {allGenres.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Language Preference</label>
              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#242424] border border-[#2a2a2a] rounded-lg text-sm focus:outline-none"
              >
                <option value="all">All Languages</option>
                {allLanguages.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* User Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedUsers.map((user) => (
          <div
            key={user.user_id}
            onClick={() => setSelectedUser(user)}
            className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a] hover:border-[#444] transition-all cursor-pointer hover:shadow-lg"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-[#e50914] to-[#b30710] rounded-full flex items-center justify-center">
                  <span className="text-lg font-bold text-white">
                    {(user.name || 'U')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold">{user.name || 'Unknown'}</h3>
                  <p className="text-xs text-gray-500">
                    {user.gender && user.age ? `${user.gender}, ${user.age}` : user.gender || (user.age ? `${user.age} yrs` : '')}
                  </p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                user.status === 'banned' 
                  ? 'bg-red-500/10 text-red-400' 
                  : 'bg-green-500/10 text-green-400'
              }`}>
                {user.status || 'active'}
              </span>
            </div>

            {/* Contact */}
            <div className="space-y-1.5 mb-3 text-sm">
              {user.email && (
                <div className="flex items-center gap-2 text-gray-400 truncate">
                  <Mail size={12} />
                  <span className="truncate">{user.email}</span>
                </div>
              )}
              {user.phone && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Phone size={12} />
                  <span>{user.phone}</span>
                </div>
              )}
              {(user.location || user.city) && (
                <div className="flex items-center gap-2 text-gray-400">
                  <MapPin size={12} />
                  <span>{user.location || user.city}</span>
                </div>
              )}
            </div>

            {/* Preferences Preview */}
            {((user.genres && user.genres.length > 0) || (user.filmLanguages && user.filmLanguages.length > 0)) && (
              <div className="space-y-2 mb-3">
                {user.genres && user.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.genres.slice(0, 3).map((genre) => (
                      <span key={genre} className="px-1.5 py-0.5 bg-[#e50914]/10 text-[#e50914] rounded text-xs">
                        {genre}
                      </span>
                    ))}
                    {user.genres.length > 3 && (
                      <span className="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">
                        +{user.genres.length - 3}
                      </span>
                    )}
                  </div>
                )}
                {user.filmLanguages && user.filmLanguages.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Globe size={11} />
                    <span>{user.filmLanguages.slice(0, 2).join(', ')}{user.filmLanguages.length > 2 ? ` +${user.filmLanguages.length - 2}` : ''}</span>
                  </div>
                )}
              </div>
            )}

            {/* Stats & Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#2a2a2a]">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Film size={12} className="text-blue-400" />
                  {user.total_swipes || 0}
                </span>
                {user.topMovies && user.topMovies.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Star size={12} className="text-yellow-400" />
                    {user.topMovies.length}
                  </span>
                )}
              </div>
              {user.status !== 'banned' ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowBanModal(user); }}
                  disabled={actionLoading === user.user_id}
                  className="p-1.5 hover:bg-red-500/10 rounded transition-colors"
                >
                  {actionLoading === user.user_id ? (
                    <Loader2 size={14} className="text-red-400 animate-spin" />
                  ) : (
                    <ShieldOff size={14} className="text-red-400" />
                  )}
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnbanUser(user.user_id); }}
                  disabled={actionLoading === user.user_id}
                  className="p-1.5 hover:bg-green-500/10 rounded transition-colors"
                >
                  {actionLoading === user.user_id ? (
                    <Loader2 size={14} className="text-green-400 animate-spin" />
                  ) : (
                    <Shield size={14} className="text-green-400" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredUsers.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-gray-400">No users found matching your filters</p>
          {activeFiltersCount > 0 && (
            <button onClick={clearFilters} className="mt-2 text-[#e50914] text-sm hover:underline">
              Clear filters
            </button>
          )}
        </div>
      )}

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
    <div className="relative w-full max-w-lg bg-[#0f0f0f] h-full overflow-y-auto">
      <div className="sticky top-0 bg-[#0f0f0f] border-b border-[#2a2a2a] p-4 flex items-center justify-between z-10">
        <h2 className="text-lg font-semibold">User Profile</h2>
        <button onClick={onClose} className="p-2 hover:bg-[#242424] rounded-lg">
          <X size={20} />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Profile Header */}
        <div className="flex items-center gap-4 pb-5 border-b border-[#2a2a2a]">
          <div className="w-20 h-20 bg-gradient-to-br from-[#e50914] to-[#b30710] rounded-full flex items-center justify-center">
            <span className="text-3xl font-bold text-white">{(user.name || 'U')[0].toUpperCase()}</span>
          </div>
          <div>
            <h3 className="text-xl font-semibold">{user.name || 'No Name'}</h3>
            <p className="text-gray-500 text-xs font-mono">{user.user_id}</p>
            {user.bio && <p className="text-gray-400 text-sm mt-1">{user.bio}</p>}
          </div>
        </div>

        {/* Basic Info */}
        <Section title="Basic Information">
          <InfoGrid>
            <InfoItem label="Email" value={user.email} />
            <InfoItem label="Phone" value={user.phone} />
            <InfoItem label="Gender" value={user.gender} />
            <InfoItem label="Age" value={user.age ? `${user.age} years` : undefined} />
            <InfoItem label="Height" value={user.height} />
            <InfoItem label="Location" value={user.location || user.city} />
            <InfoItem label="Zodiac" value={user.zodiac} />
            <InfoItem label="Religion" value={user.religion} />
            <InfoItem label="Joined" value={user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : undefined} />
          </InfoGrid>
        </Section>

        {/* Work & Education */}
        <Section title="Work & Education">
          <InfoGrid>
            <InfoItem label="Education" value={user.education} icon={<GraduationCap size={12} />} />
            <InfoItem label="Work" value={user.workProfile} icon={<Briefcase size={12} />} />
            <InfoItem label="Marital Status" value={user.maritalStatus} />
            <InfoItem label="Siblings" value={user.siblings} />
            <InfoItem label="Family Planning" value={user.familyPlanning} />
          </InfoGrid>
        </Section>

        {/* Lifestyle */}
        <Section title="Lifestyle">
          <InfoGrid>
            <InfoItem label="Drinking" value={user.drinking} icon={<Wine size={12} />} />
            <InfoItem label="Smoking" value={user.smoking} icon={<Cigarette size={12} />} />
            <InfoItem label="Exercise" value={user.exercise} icon={<Dumbbell size={12} />} />
            <InfoItem label="Food Preference" value={user.foodPreference} />
            <InfoItem label="Pets" value={user.pets} icon={<Dog size={12} />} />
            <InfoItem label="Travel" value={user.travel} icon={<Plane size={12} />} />
          </InfoGrid>
        </Section>

        {/* Dating Preferences */}
        <Section title="Dating Preferences">
          <InfoGrid>
            <InfoItem label="Looking For" value={(user.relationshipIntent || []).join(', ')} icon={<Heart size={12} />} />
            <InfoItem label="Partner Preference" value={user.partnerPreference} />
            <InfoItem label="Movie Date Mode" value={user.movieDateMode ? 'Yes' : 'No'} />
            <InfoItem label="Movie Buddy Mode" value={user.movieBuddyMode ? 'Yes' : 'No'} />
          </InfoGrid>
        </Section>

        {/* Movie Preferences */}
        <Section title="Movie Preferences">
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 mb-2">Favorite Genres</p>
              {user.genres && user.genres.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {user.genres.map((g) => (
                    <span key={g} className="px-2 py-1 bg-[#e50914]/10 text-[#e50914] rounded text-xs">{g}</span>
                  ))}
                </div>
              ) : <span className="text-gray-600 text-sm">Not specified</span>}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Film Languages</p>
              {user.filmLanguages && user.filmLanguages.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {user.filmLanguages.map((l) => (
                    <span key={l} className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-xs">{l}</span>
                  ))}
                </div>
              ) : <span className="text-gray-600 text-sm">Not specified</span>}
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Languages Spoken</p>
              {user.languagesSpoken && user.languagesSpoken.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {user.languagesSpoken.map((l) => (
                    <span key={l} className="px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs">{l}</span>
                  ))}
                </div>
              ) : <span className="text-gray-600 text-sm">Not specified</span>}
            </div>
            <InfoGrid cols={2}>
              <InfoItem label="Movie Frequency" value={user.movieFrequency} />
              <InfoItem label="OTT vs Theatre" value={user.ottTheatre} />
            </InfoGrid>
          </div>
        </Section>

        {/* Top 5 Movies */}
        <Section title="Top 5 Movies">
          {user.topMovies && user.topMovies.length > 0 ? (
            <div className="space-y-3">
              {user.topMovies.map((movie: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-[#1a1a1a] rounded-lg">
                  {movie.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                      alt={movie.title}
                      className="w-12 h-18 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-18 bg-[#2a2a2a] rounded flex items-center justify-center">
                      <Film size={20} className="text-gray-600" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{movie.title}</p>
                    {movie.rating && (
                      <div className="flex items-center gap-1 mt-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={12}
                            className={i < movie.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'}
                          />
                        ))}
                      </div>
                    )}
                    {movie.genres && movie.genres.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">{movie.genres.slice(0, 2).join(', ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm">No movies selected</p>
          )}
        </Section>

        {/* Activity */}
        <Section title="Activity">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-[#1a1a1a] rounded-lg">
              <p className="text-3xl font-bold text-[#e50914]">{user.total_swipes || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Total Swipes</p>
            </div>
            <div className="text-center p-4 bg-[#1a1a1a] rounded-lg">
              <p className="text-3xl font-bold text-green-400">{user.total_matches || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Matches</p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  </div>
)

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-[#1a1a1a] rounded-xl p-4">
    <h4 className="text-sm font-medium text-gray-400 mb-3">{title}</h4>
    {children}
  </div>
)

const InfoGrid: React.FC<{ children: React.ReactNode; cols?: number }> = ({ children, cols = 2 }) => (
  <div className={`grid grid-cols-${cols} gap-3`}>{children}</div>
)

const InfoItem: React.FC<{ label: string; value?: string | number | null; icon?: React.ReactNode }> = ({ label, value, icon }) => (
  <div>
    <p className="text-xs text-gray-500 flex items-center gap-1 mb-0.5">
      {icon}
      {label}
    </p>
    <p className="text-sm">{value || <span className="text-gray-600">—</span>}</p>
  </div>
)
