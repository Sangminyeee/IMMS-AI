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
  { name: '리포트', path: '/reports', icon: '📄' },
  { name: '설정', path: '/settings', icon: '⚙️' },
  { name: '프로필', path: '/profile', icon: '👤' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, profile } = useAuth()

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-gradient-to-b from-blue-900 to-blue-800 text-white shadow-2xl flex flex-col z-50">
      {/* Logo */}
      <div className="p-6 border-b border-blue-700">
        <h1 className="text-2xl font-bold">IMMS</h1>
        <p className="text-sm text-blue-200 mt-1">실시간 회의 시스템</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.path || pathname?.startsWith(item.path + '/')
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-blue-700 shadow-lg'
                  : 'hover:bg-blue-700/50'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              <span className="font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-blue-700">
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-700/50 rounded-lg">
          <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-lg font-bold">
            {user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {profile?.name || user?.email || '사용자'}
            </p>
            <p className="text-xs text-blue-200 truncate">
              {profile?.occupation || profile?.role || '직책'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
