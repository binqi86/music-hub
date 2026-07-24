import React, { useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Generate } from './pages/Generate';
import { Library } from './pages/Library';
import { TrackDetail } from './pages/TrackDetail';
import { Settings } from './pages/Settings';

export type Page = 'dashboard' | 'generate' | 'library' | 'track' | 'settings';
export type PageParams = { id?: string };

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageParams, setPageParams] = useState<PageParams>({});

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