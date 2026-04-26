import React from 'react'
import {
  TrendingUp,
  Users,
  Heart,
  Film,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const retentionData = [
  { cohort: 'Week 1', day1: 100, day7: 65, day14: 48, day30: 32 },
  { cohort: 'Week 2', day1: 100, day7: 68, day14: 52, day30: 35 },
  { cohort: 'Week 3', day1: 100, day7: 72, day14: 55, day30: 38 },
  { cohort: 'Week 4', day1: 100, day7: 70, day14: 51, day30: 34 },
]

const funnelData = [
  { stage: 'Signups', value: 1000, color: '#3b82f6' },
  { stage: 'Onboarding', value: 850, color: '#8b5cf6' },
  { stage: 'First Swipe', value: 680, color: '#ec4899' },
  { stage: 'First Match', value: 340, color: '#f59e0b' },
  { stage: 'Active (7d)', value: 272, color: '#22c55e' },
]

const swipeConversionData = [
  { name: 'Mon', swipes: 450, matches: 23, rate: 5.1 },
  { name: 'Tue', swipes: 520, matches: 28, rate: 5.4 },
  { name: 'Wed', swipes: 480, matches: 25, rate: 5.2 },
  { name: 'Thu', swipes: 610, matches: 32, rate: 5.2 },
  { name: 'Fri', swipes: 720, matches: 41, rate: 5.7 },
  { name: 'Sat', swipes: 850, matches: 48, rate: 5.6 },
  { name: 'Sun', swipes: 780, matches: 38, rate: 4.9 },
]

const genrePopularity = [
  { name: 'Action', value: 28 },
  { name: 'Comedy', value: 22 },
  { name: 'Drama', value: 18 },
  { name: 'Romance', value: 15 },
  { name: 'Thriller', value: 10 },
  { name: 'Other', value: 7 },
]

const COLORS = ['#e50914', '#3b82f6', '#22c55e', '#ec4899', '#f59e0b', '#8b5cf6']

export const AnalyticsTab: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-[var(--text-secondary)]">
          Platform performance metrics and insights
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="Conversion Rate"
          value="5.4%"
          change="+0.3%"
          positive
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <MetricCard
          title="7-Day Retention"
          value="68%"
          change="+2%"
          positive
          icon={<Users className="w-5 h-5" />}
        />
        <MetricCard
          title="Avg. Swipes/User"
          value="45"
          change="+8"
          positive
          icon={<Film className="w-5 h-5" />}
        />
        <MetricCard
          title="Match Rate"
          value="12%"
          change="-1%"
          positive={false}
          icon={<Heart className="w-5 h-5" />}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold mb-4">User Funnel</h3>
          <div className="space-y-3">
            {funnelData.map((item, idx) => (
              <div key={item.stage}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{item.stage}</span>
                  <span className="text-[var(--text-secondary)]">{item.value}</span>
                </div>
                <div className="h-8 bg-[var(--bg-card)] rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-all duration-500"
                    style={{
                      width: `${(item.value / funnelData[0].value) * 100}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Genre Popularity */}
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold mb-4">Genre Popularity</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={genrePopularity}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value}%`}
              >
                {genrePopularity.map((_, index) => (
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
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Swipe to Match Conversion */}
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold mb-4">Swipe to Match Conversion</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={swipeConversionData}>
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
              <Bar dataKey="matches" fill="#e50914" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Retention Cohorts */}
        <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
          <h3 className="text-lg font-semibold mb-4">Retention Cohorts</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-secondary)]">
                  <th className="text-left py-2">Cohort</th>
                  <th className="text-center py-2">Day 1</th>
                  <th className="text-center py-2">Day 7</th>
                  <th className="text-center py-2">Day 14</th>
                  <th className="text-center py-2">Day 30</th>
                </tr>
              </thead>
              <tbody>
                {retentionData.map((row) => (
                  <tr key={row.cohort} className="border-t border-[var(--border-color)]">
                    <td className="py-3">{row.cohort}</td>
                    <td className="text-center py-3">
                      <span className="px-2 py-1 rounded bg-[var(--success)]/20 text-[var(--success)]">
                        {row.day1}%
                      </span>
                    </td>
                    <td className="text-center py-3">
                      <span className="px-2 py-1 rounded bg-[var(--info)]/20 text-[var(--info)]">
                        {row.day7}%
                      </span>
                    </td>
                    <td className="text-center py-3">
                      <span className="px-2 py-1 rounded bg-[var(--warning)]/20 text-[var(--warning)]">
                        {row.day14}%
                      </span>
                    </td>
                    <td className="text-center py-3">
                      <span className="px-2 py-1 rounded bg-[var(--error)]/20 text-[var(--error)]">
                        {row.day30}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string
  change: string
  positive: boolean
  icon: React.ReactNode
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, positive, icon }) => (
  <div className="bg-[var(--bg-secondary)] rounded-xl p-5 border border-[var(--border-color)]">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[var(--text-secondary)] text-sm mb-1">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
        <div className={`flex items-center gap-1 text-sm mt-1 ${positive ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>
          {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{change}</span>
        </div>
      </div>
      <div className="p-3 bg-[var(--accent)]/10 rounded-lg text-[var(--accent)]">
        {icon}
      </div>
    </div>
  </div>
)
