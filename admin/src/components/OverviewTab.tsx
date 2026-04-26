import React from 'react'
import {
  Users,
  UserPlus,
  Heart,
  Film,
  Clock,
  TrendingUp,
  Activity,
  RefreshCw,
} from 'lucide-react'
import { useDashboardStore } from '../store/dashboardStore'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  change?: string
  positive?: boolean
  color?: string
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, change, positive, color = 'accent' }) => (
  <div className="stat-card bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[var(--text-secondary)] text-sm mb-1">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        {change && (
          <p className={`text-sm mt-1 ${positive ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
            {positive ? '↑' : '↓'} {change}
          </p>
        )}
      </div>
      <div className={`p-3 rounded-lg bg-[var(--${color})]/10`}>{icon}</div>
    </div>
  </div>
)

const COLORS = ['#3b82f6', '#ec4899', '#8b5cf6']

export const OverviewTab: React.FC = () => {
  const { metrics, recentActivity, isConnected } = useDashboardStore()

  // Mock chart data - in production this would come from the API
  const activityData = [
    { name: 'Mon', users: 120, swipes: 450, matches: 23 },
    { name: 'Tue', users: 145, swipes: 520, matches: 28 },
    { name: 'Wed', users: 132, swipes: 480, matches: 25 },
    { name: 'Thu', users: 168, swipes: 610, matches: 32 },
    { name: 'Fri', users: 195, swipes: 720, matches: 41 },
    { name: 'Sat', users: 210, swipes: 850, matches: 48 },
    { name: 'Sun', users: 185, swipes: 780, matches: 38 },
  ]

  const genderData = metrics?.genderDistribution
    ? [
        { name: 'Male', value: metrics.genderDistribution.male },
        { name: 'Female', value: metrics.genderDistribution.female },
        { name: 'Other', value: metrics.genderDistribution.other },
      ]
    : [
        { name: 'Male', value: 45 },
        { name: 'Female', value: 48 },
        { name: 'Other', value: 7 },
      ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Overview</h1>
          <p className="text-[var(--text-secondary)]">
            Real-time platform metrics and analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-2 px-3 py-1.5 bg-[var(--success)]/10 text-[var(--success)] rounded-full text-sm">
              <span className="w-2 h-2 bg-[var(--success)] rounded-full animate-pulse" />
              Live Updates
            </span>
          ) : (
            <span className="flex items-center gap-2 px-3 py-1.5 bg-[var(--error)]/10 text-[var(--error)] rounded-full text-sm">
              <RefreshCw size={14} className="animate-spin" />
              Reconnecting...
            </span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={metrics?.totalUsers?.toLocaleString() || '—'}
          icon={<Users className="w-5 h-5 text-[var(--accent)]" />}
          change="12% this month"
          positive
        />
        <StatCard
          title="Active Today"
          value={metrics?.activeToday?.toLocaleString() || '—'}
          icon={<Activity className="w-5 h-5 text-[var(--success)]" />}
          color="success"
        />
        <StatCard
          title="New Signups Today"
          value={metrics?.newSignupsToday?.toLocaleString() || '—'}
          icon={<UserPlus className="w-5 h-5 text-[var(--info)]" />}
          change="8% vs yesterday"
          positive
          color="info"
        />
        <StatCard
          title="Total Matches"
          value={metrics?.totalMatches?.toLocaleString() || '—'}
          icon={<Heart className="w-5 h-5 text-[var(--error)]" />}
          color="error"
        />
      </div>

      {/* Second Row Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Daily Active Users"
          value={metrics?.dau?.toLocaleString() || '—'}
          icon={<TrendingUp className="w-5 h-5 text-[var(--warning)]" />}
          color="warning"
        />
        <StatCard
          title="Weekly Active Users"
          value={metrics?.wau?.toLocaleString() || '—'}
          icon={<TrendingUp className="w-5 h-5 text-[var(--info)]" />}
          color="info"
        />
        <StatCard
          title="Monthly Active Users"
          value={metrics?.mau?.toLocaleString() || '—'}
          icon={<TrendingUp className="w-5 h-5 text-[var(--success)]" />}
          color="success"
        />
        <StatCard
          title="Swipes Today"
          value={metrics?.totalSwipesToday?.toLocaleString() || '—'}
          icon={<Film className="w-5 h-5 text-[var(--accent)]" />}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="lg:col-span-2 bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold mb-4">Weekly Activity</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={activityData}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorSwipes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e50914" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#e50914" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '8px',
                }}
              />
              <Area
                type="monotone"
                dataKey="users"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorUsers)"
                name="Active Users"
              />
              <Area
                type="monotone"
                dataKey="matches"
                stroke="#e50914"
                fillOpacity={1}
                fill="url(#colorSwipes)"
                name="Matches"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gender Distribution */}
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold mb-4">Gender Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={genderData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {genderData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a1a',
                  border: '1px solid #333',
                  borderRadius: '8px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-4">
            {genderData.map((item, index) => (
              <div key={item.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index] }}
                />
                <span className="text-sm text-[var(--text-secondary)]">
                  {item.name}: {item.value}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {recentActivity.length === 0 ? (
            <p className="text-[var(--text-muted)] text-center py-8">
              No recent activity. Events will appear here in real-time.
            </p>
          ) : (
            recentActivity.slice(0, 20).map((activity, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 bg-[var(--bg-card)] rounded-lg"
              >
                {activity.type === 'new_user' && (
                  <UserPlus className="w-5 h-5 text-[var(--success)]" />
                )}
                {activity.type === 'new_swipe' && (
                  <Film className="w-5 h-5 text-[var(--info)]" />
                )}
                {activity.type === 'new_match' && (
                  <Heart className="w-5 h-5 text-[var(--error)]" />
                )}
                {activity.type === 'user_updated' && (
                  <Users className="w-5 h-5 text-[var(--warning)]" />
                )}
                <div className="flex-1">
                  <p className="text-sm">
                    {activity.type === 'new_user' && `New user: ${activity.data?.name || activity.data?.email || 'Unknown'}`}
                    {activity.type === 'new_swipe' && `Swipe: ${activity.data?.user_name || activity.data?.user_id} ${activity.data?.direction === 'right' ? 'liked' : 'passed'} ${activity.data?.movie_title}`}
                    {activity.type === 'new_match' && `Match: ${activity.data?.user1_name} & ${activity.data?.user2_name}`}
                    {activity.type === 'user_updated' && `Profile updated: ${activity.data?.name || activity.data?.user_id}`}
                  </p>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
