import React from 'react'
import {
  Users,
  UserPlus,
  Heart,
  Film,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { useDashboardStore } from '../store/dashboardStore'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  subtitle?: string
  color: string
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, subtitle, color }) => (
  <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#2a2a2a] hover:border-[#333] transition-colors">
    <div className="flex items-center justify-between mb-4">
      <div className={`p-3 rounded-lg`} style={{ backgroundColor: `${color}15` }}>
        <div style={{ color }}>{icon}</div>
      </div>
    </div>
    <p className="text-3xl font-bold mb-1">{value}</p>
    <p className="text-gray-400 text-sm">{title}</p>
    {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
  </div>
)

const COLORS = ['#3b82f6', '#ec4899', '#8b5cf6']

export const OverviewTab: React.FC = () => {
  const { metrics, recentActivity, isConnected } = useDashboardStore()

  const activityData = [
    { name: 'Mon', users: 120, matches: 23 },
    { name: 'Tue', users: 145, matches: 28 },
    { name: 'Wed', users: 132, matches: 25 },
    { name: 'Thu', users: 168, matches: 32 },
    { name: 'Fri', users: 195, matches: 41 },
    { name: 'Sat', users: 210, matches: 48 },
    { name: 'Sun', users: 185, matches: 38 },
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
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Platform overview and metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">{isConnected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {/* Main Stats - Clean 4-column grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={metrics?.totalUsers?.toLocaleString() || '—'}
          icon={<Users className="w-5 h-5" />}
          color="#3b82f6"
        />
        <StatCard
          title="Active Today"
          value={metrics?.activeToday?.toLocaleString() || '—'}
          icon={<Activity className="w-5 h-5" />}
          color="#22c55e"
        />
        <StatCard
          title="New Signups"
          value={metrics?.newSignupsToday?.toLocaleString() || '—'}
          subtitle="Today"
          icon={<UserPlus className="w-5 h-5" />}
          color="#f59e0b"
        />
        <StatCard
          title="Total Swipes"
          value={metrics?.totalSwipesToday?.toLocaleString() || '—'}
          subtitle="Today"
          icon={<Film className="w-5 h-5" />}
          color="#e50914"
        />
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
          <p className="text-gray-400 text-sm mb-1">Daily Active</p>
          <p className="text-2xl font-bold">{metrics?.dau || '—'}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
          <p className="text-gray-400 text-sm mb-1">Weekly Active</p>
          <p className="text-2xl font-bold">{metrics?.wau || '—'}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl p-5 border border-[#2a2a2a]">
          <p className="text-gray-400 text-sm mb-1">Monthly Active</p>
          <p className="text-2xl font-bold">{metrics?.mau || '—'}</p>
        </div>
      </div>

      {/* Charts - Side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="lg:col-span-2 bg-[#1a1a1a] rounded-xl p-6 border border-[#2a2a2a]">
          <h3 className="text-lg font-semibold mb-6">Weekly Activity</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={activityData}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" stroke="#666" tickLine={false} axisLine={false} />
              <YAxis stroke="#666" tickLine={false} axisLine={false} />
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
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorUsers)"
                name="Active Users"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gender Distribution */}
        <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#2a2a2a]">
          <h3 className="text-lg font-semibold mb-4">Gender Split</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={genderData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={65}
                paddingAngle={3}
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
          <div className="flex justify-center gap-4 mt-2">
            {genderData.map((item, index) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index] }} />
                <span className="text-gray-400">{item.name}: {item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity - Compact */}
      <div className="bg-[#1a1a1a] rounded-xl p-6 border border-[#2a2a2a]">
        <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
        <div className="space-y-2 max-h-[200px] overflow-y-auto">
          {recentActivity.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">
              No recent activity. Events appear here in real-time.
            </p>
          ) : (
            recentActivity.slice(0, 10).map((activity, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-2.5 bg-[#242424] rounded-lg text-sm"
              >
                {activity.type === 'new_user' && <UserPlus className="w-4 h-4 text-green-500" />}
                {activity.type === 'new_swipe' && <Film className="w-4 h-4 text-blue-500" />}
                {activity.type === 'new_match' && <Heart className="w-4 h-4 text-red-500" />}
                {activity.type === 'user_updated' && <Users className="w-4 h-4 text-yellow-500" />}
                <span className="flex-1 text-gray-300">
                  {activity.type === 'new_user' && `New user: ${activity.data?.name || 'Unknown'}`}
                  {activity.type === 'new_swipe' && `${activity.data?.user_name} ${activity.data?.direction === 'right' ? 'liked' : 'passed'} ${activity.data?.movie_title}`}
                  {activity.type === 'new_match' && `Match: ${activity.data?.user1_name} & ${activity.data?.user2_name}`}
                  {activity.type === 'user_updated' && `Profile updated: ${activity.data?.name}`}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
