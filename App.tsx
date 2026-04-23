import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { AuthPage } from './pages/AuthPage';
import { ApiSetupPage } from './pages/ApiSetupPage';
import { GeneratorPage } from './pages/GeneratorPage';
import { ModifyReportPage } from './pages/ModifyReportPage';
import { ReportsPage } from './pages/ReportsPage';
import { Header } from './components/Header';
import type { AppUser, ReportSpec } from './types';

type Page = 'auth' | 'api-setup' | 'generator' | 'modify' | 'reports';

const App: React.FC = () => {
  const { auth, login, logout } = useAuth();
  const [page, setPage] = useState<Page>('auth');
  const [generatorInitialState, setGeneratorInitialState] = useState<ReportSpec | undefined>();

  useEffect(() => {
    if (!auth.token || !auth.user) {
      setPage('auth');
      return;
    }
    const isFirstLogin = localStorage.getItem('abap_firstLogin') === '1';
    setPage(isFirstLogin ? 'api-setup' : 'generator');
  }, [auth.token, auth.user]);

  const handleAuth = (token: string, user: AppUser) => {
    login(token, user);
  };

  const handleApiSetupComplete = () => {
    localStorage.removeItem('abap_firstLogin');
    setPage('generator');
  };

  const handleReuse = (spec: ReportSpec) => {
    setGeneratorInitialState(spec);
    setPage('generator');
  };

  if (!auth.token || !auth.user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  const headerPage = page === 'auth' ? 'generator' : page as 'generator' | 'modify' | 'reports' | 'api-setup';

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Header
        user={auth.user}
        currentPage={headerPage}
        onNavigate={(p) => setPage(p)}
        onLogout={logout}
      />
      {page === 'api-setup' && (
        <ApiSetupPage
          token={auth.token}
          onComplete={handleApiSetupComplete}
          isSettingsMode={localStorage.getItem('abap_firstLogin') !== '1'}
        />
      )}
      {/* Keep these three always mounted so in-progress generation is never interrupted by tab switches */}
      <div style={{ display: page === 'generator' ? undefined : 'none' }}>
        <GeneratorPage
          token={auth.token}
          initialState={generatorInitialState}
          onInitialStateConsumed={() => setGeneratorInitialState(undefined)}
        />
      </div>
      <div style={{ display: page === 'modify' ? undefined : 'none' }}>
        <ModifyReportPage token={auth.token} />
      </div>
      <div style={{ display: page === 'reports' ? undefined : 'none' }}>
        <ReportsPage token={auth.token} onReuse={handleReuse} />
      </div>
    </div>
  );
};

export default App;
