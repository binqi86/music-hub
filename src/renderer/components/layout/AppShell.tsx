import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { PlayerBar } from './PlayerBar';
import type { Page, PageParams } from '../../App';

interface AppShellProps {
  children: React.ReactNode;
  currentPage: Page;
  onNavigate: (page: Page, params?: PageParams) => void;
}

export function AppShell({ children, currentPage, onNavigate }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-full flex flex-col bg-surface-900">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          currentPage={currentPage}
          onNavigate={onNavigate}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      <PlayerBar />
    </div>
  );
}