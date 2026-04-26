import React, { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  Film,
  Heart,
  BarChart3,
  Flag,
  LogOut,
  Menu,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useDashboardStore } from '../store/dashboardStore'

interface LayoutProps {
  children: React.ReactNode
  activeTab: string
  setActiveTab: (tab: string) => void
}

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'swipes', label: 'Movie Swipes', icon: Film },
  { id: 'matches', label: 'Matches', icon: Heart },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'reports', label: 'Reports', icon: Flag },
]

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { admin, logout } = useAuthStore()
  const { isConnected } = useDashboardStore()

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-[var(--bg-secondary)] border-r border-[var(--border-color)] transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[var(--border-color)]">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <Film className="w-8 h-8 text-[var(--accent)]" />
              <span className="font-bold text-lg">Film Admin</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                activeTab === item.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-white'
              }`}
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Connection Status */}
        <div className="px-4 py-3 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi size={16} className="text-[var(--success)]" />
                {sidebarOpen && <span className="text-sm text-[var(--success)]">Live</span>}
              </>
            ) : (
              <>
                <WifiOff size={16} className="text-[var(--error)]" />
                {sidebarOpen && <span className="text-sm text-[var(--error)]">Offline</span>}
              </>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="p-4 border-t border-[var(--border-color)]">
          {sidebarOpen && (
            <div className="mb-2">
              <p className="font-medium truncate">{admin?.name}</p>
              <p className="text-sm text-[var(--text-muted)] truncate">{admin?.email}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--error)] transition-colors"
          >
            <LogOut size={18} />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
