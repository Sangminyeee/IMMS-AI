'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface NavItem {
  name: string
  path: string
  icon: string
}

const navItems: NavItem[] = [
  { name: '대시보드', path: '/dashboard', icon: '📊' },
  { name: '회의', path: '/meetings', icon: '💬' },
  { name: '리포트', path: '/reports', icon: '📄' },
  { name: '설정', path: '/settings', icon: '⚙️' },
  { name: '프로필', path: '/profile', icon: '👤' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, profile } = useAuth()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-teams-purple-dark text-white shadow-teams-xl flex flex-col z-50 border-r border-teams-purple-dark/80">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 bg-white rounded-teams-md flex items-center justify-center shadow-teams-sm">
            <span className="text-2xl">💼</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">IMMS</h1>
            <p className="text-[11px] text-white/70 font-normal">실시간 회의 시스템</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const isActive = pathname === item.path || pathname?.startsWith(item.path + '/')
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-teams transition-all duration-150 group relative ${
                isActive
                  ? 'bg-teams-blue text-white shadow-teams-sm'
                  : 'text-white/90 hover:bg-teams-hover-strong hover:text-white'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white rounded-r-full" />
              )}
              <span className="text-xl group-hover:scale-105 transition-transform duration-150">{item.icon}</span>
              <span className={`font-medium text-[13.5px] ${isActive ? 'font-semibold' : ''}`}>
                {item.name}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* User Info */}
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-2 py-2.5 bg-white/5 rounded-teams-md hover:bg-white/10 transition-colors cursor-pointer group">
          <div className="w-9 h-9 bg-gradient-to-br from-teams-blue to-teams-purple rounded-full flex items-center justify-center text-sm font-semibold shadow-teams-sm ring-2 ring-white/20">
            {user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate text-white">
              {profile?.name || user?.email || '사용자'}
            </p>
            <p className="text-[11px] text-white/60 truncate group-hover:text-white/80 transition-colors">
              {profile?.occupation || profile?.role || '직책'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
