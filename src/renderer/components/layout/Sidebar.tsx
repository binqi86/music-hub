import React from 'react';
import { Music, Library, Sparkles, Settings, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useThemeStore } from '../../stores/theme-store';
import type { Page, PageParams } from '../../App';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  currentPage: Page;
  onNavigate: (page: Page, params?: PageParams) => void;
}

const navItems: { page: Page; label: string; icon: typeof Music }[] = [
  { page: 'dashboard', label: '首页', icon: Music },
  { page: 'generate', label: '生成', icon: Sparkles },
  { page: 'library', label: '曲库', icon: Library },
  { page: 'settings', label: '设置', icon: Settings },
];

export function Sidebar({ collapsed, onToggle, currentPage, onNavigate }: SidebarProps) {
  const { isDark, toggle: toggleTheme } = useThemeStore();

  return (
    <aside
      className={`relative flex flex-col bg-surface-950 border-r border-surface-700/30 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-surface-700/30">
        {!collapsed && (
          <h1 className="text-lg font-bold text-gradient">Music Hub</h1>
        )}
        {collapsed && (
          <Music className="w-6 h-6 text-brand-500 mx-auto" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                collapsed ? 'justify-center px-2' : ''
              } ${
                isActive
                  ? 'text-brand-500 bg-brand-500/10 border-r-2 border-brand-500'
                  : 'text-theme-secondary hover:text-theme-primary hover:bg-surface-800'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="flex items-center gap-3 px-4 py-3 text-theme-secondary hover:text-theme-primary hover:bg-surface-800 transition-colors"
      >
        {isDark ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
        {!collapsed && <span className="text-sm">{isDark ? '亮色模式' : '暗色模式'}</span>}
      </button>

      {/* Collapse toggle — floating at right-middle edge */}
      <button
        onClick={onToggle}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10
                   w-6 h-6 rounded-full
                   bg-surface-800 border border-surface-700/50
                   text-theme-secondary hover:text-theme-primary
                   hover:bg-surface-700 hover:border-brand-500/50
                   flex items-center justify-center
                   shadow-md transition-all duration-200"
        title={collapsed ? '展开菜单' : '收起菜单'}
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" />
        )}
      </button>
    </aside>
  );
}
