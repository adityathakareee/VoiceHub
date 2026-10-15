import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar, NavItem } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardView } from './views/DashboardView';
import { RoomsView } from './views/RoomsView';
import { CreateRoomView } from './views/CreateRoomView';
import { RoomDetailView } from './views/RoomDetailView';
import { NetworkMonitorView } from './views/NetworkMonitorView';
import { AdaptiveTransportView } from './views/AdaptiveTransportView';
import { SystemStatusView } from './views/SystemStatusView';
import { ArchitectureView } from './components/ArchitectureView';
import { ProfileView } from './views/ProfileView';
import { LoginView } from './views/LoginView';
import { RegisterView } from './views/RegisterView';

const MainAppContent: React.FC = () => {
  const { isAuthenticated, logout } = useAuth();
  const [activeNav, setActiveNav] = useState<NavItem>('overview');
  const [selectedRoomCode, setSelectedRoomCode] = useState<string>('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Auto redirect from login/register to overview once authenticated
  useEffect(() => {
    if (isAuthenticated && (activeNav === 'login' || activeNav === 'register')) {
      setActiveNav('overview');
    }
  }, [isAuthenticated, activeNav]);

  const handleOpenRoom = (roomCode: string) => {
    setSelectedRoomCode(roomCode);
    setActiveNav('room-detail');
  };

  const handleNavigate = (item: NavItem) => {
    setActiveNav(item);
    setMobileMenuOpen(false);
  };

  // Dedicated Clean Standalone Authentication Layout (NO App Sidebar or Shell)
  if (activeNav === 'login') {
    return (
      <div className="auth-standalone-layout">
        <LoginView
          onSuccess={() => setActiveNav('overview')}
          onNavigateToRegister={() => setActiveNav('register')}
          onNavigateToOverview={() => setActiveNav('overview')}
        />
      </div>
    );
  }

  if (activeNav === 'register') {
    return (
      <div className="auth-standalone-layout">
        <RegisterView
          onSuccess={() => setActiveNav('login')}
          onNavigateToLogin={() => setActiveNav('login')}
          onNavigateToOverview={() => setActiveNav('overview')}
        />
      </div>
    );
  }

  return (
    <div
      className={`app-shell ${
        isSidebarCollapsed ? 'app-shell--sidebar-collapsed' : 'app-shell--sidebar-expanded'
      }`}
    >
      {/* 1. Professional Collapsible Left Sidebar */}
      <Sidebar
        activeNav={activeNav}
        onNavigate={handleNavigate}
        activeRoomCode={selectedRoomCode}
        onOpenActiveRoom={() => setActiveNav('room-detail')}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* 2. Top Header + Main Content Viewport */}
      <div className="app-main-layout">
        <TopHeader
          activeNav={activeNav}
          activeRoomCode={selectedRoomCode}
          onNavigate={handleNavigate}
          onLogout={logout}
          onToggleMobileMenu={() => setMobileMenuOpen((prev) => !prev)}
        />

        <main className="app-content">
          {/* Platform & Engineering Views */}
          {activeNav === 'overview' && (
            <DashboardView
              onNavigateToProfile={() => setActiveNav('profile')}
              onNavigateToCreateRoom={() => setActiveNav('create-room')}
              onOpenRoom={handleOpenRoom}
              onNavigateToNetworkMonitor={() => setActiveNav('network-monitor')}
              onNavigateToAdaptiveTransport={() => setActiveNav('adaptive-transport')}
              onNavigateToLogin={() => setActiveNav('login')}
              onNavigateToRegister={() => setActiveNav('register')}
            />
          )}

          {activeNav === 'network-monitor' && <NetworkMonitorView />}

          {activeNav === 'adaptive-transport' && <AdaptiveTransportView />}

          {activeNav === 'system-status' && <SystemStatusView />}

          {activeNav === 'architecture' && <ArchitectureView />}

          {/* Protected Views */}
          {activeNav === 'rooms' && (
            <ProtectedRoute onRedirectToLogin={() => setActiveNav('login')}>
              <RoomsView
                onOpenRoom={handleOpenRoom}
                onNavigateToCreateRoom={() => setActiveNav('create-room')}
              />
            </ProtectedRoute>
          )}

          {activeNav === 'create-room' && (
            <ProtectedRoute onRedirectToLogin={() => setActiveNav('login')}>
              <CreateRoomView
                onRoomCreated={handleOpenRoom}
                onCancel={() => setActiveNav('rooms')}
              />
            </ProtectedRoute>
          )}

          {activeNav === 'room-detail' && selectedRoomCode && (
            <ProtectedRoute onRedirectToLogin={() => setActiveNav('login')}>
              <RoomDetailView
                roomCode={selectedRoomCode}
                onNavigateBack={() => setActiveNav('rooms')}
              />
            </ProtectedRoute>
          )}

          {activeNav === 'profile' && (
            <ProtectedRoute onRedirectToLogin={() => setActiveNav('login')}>
              <ProfileView onRequireLogin={() => setActiveNav('login')} />
            </ProtectedRoute>
          )}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
};

export default App;
