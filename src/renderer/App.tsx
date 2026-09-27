import React, { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Generate } from './pages/Generate';
import { Library } from './pages/Library';
import { TrackDetail } from './pages/TrackDetail';
import { Settings } from './pages/Settings';
import { onTaskUpdate } from './lib/electron-api';
import { useGenerationStore, isTerminalStatus } from './stores/generation-store';

export type Page = 'dashboard' | 'generate' | 'library' | 'track' | 'settings';
export type PageParams = { id?: string };

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageParams, setPageParams] = useState<PageParams>({});

  // 全局只注册一次任务状态监听。
  // 之前监听注册在生成页里，离开生成页就注销了 —— 结果就是：在别的页面期间完成的任务
  // 永远收不到终态事件，任务卡会一直转圈，而歌曲其实早就生成好了。
  useEffect(() => {
    const cleanup = onTaskUpdate((data) => {
      const store = useGenerationStore.getState();
      store.updateTask(data.taskId, {
        status: data.status,
        progress: data.progress ?? 0,
        error: data.error,
      });

      if (isTerminalStatus(data.status)) {
        store.bumpRevision();
        setTimeout(() => {
          useGenerationStore.getState().removeTask(data.taskId);
        }, 10000);
      }
    });
    return cleanup;
  }, []);

  const navigate = (page: Page, params?: PageParams) => {
    setCurrentPage(page);
    if (params) setPageParams(params);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={navigate} />;
      case 'generate':
        return <Generate />;
      case 'library':
        return <Library onNavigate={navigate} />;
      case 'track':
        return <TrackDetail trackId={pageParams.id || ''} onNavigate={navigate} />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <AppShell currentPage={currentPage} onNavigate={navigate}>
      {renderPage()}
    </AppShell>
  );
}
