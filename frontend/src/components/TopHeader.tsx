import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchSystemHealth } from '../services/api';
import { NavViewMode } from './Sidebar';
import { Icons } from './Icons';

export interface TopHeaderProps {
  currentView?: NavViewMode;
  activeNav?: NavViewMode;
  onNavigate: (view: NavViewMode) => void;
  activeRoomCode?: string;
  onLogout?: () => void;
  onToggleMobileMenu?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentView,
  activeNav,
  onNavigate,
  activeRoomCode,
  onLogout,
  onToggleMobileMenu,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const effectiveView = activeNav || currentView || 'overview';
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);

  const handleLogout = onLogout || logout;

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const res = await fetchSystemHealth();
        if (mounted) {
          setIsHealthy(!!res.data?.success && res.data.status === 'healthy');
        }
      } catch {
        if (mounted) setIsHealthy(false);
      }
    };
    check();
    const timer = setInterval(check, 10000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const getViewTitle = (view: NavViewMode): string => {
    switch (view) {
      case 'overview':
        return 'Overview & System Dashboard';
      case 'rooms':
        return 'Conference Rooms Directory';
      case 'create-room':
        return 'Create Conference Room';
      case 'room-detail':
        return `Live Conference Room ${activeRoomCode ? `(${activeRoomCode})` : ''}`;
      case 'network-monitor':
        return 'Network Telemetry & Performance Monitor';
      case 'adaptive-transport':
        return 'Adaptive UDP Rate Control & Profiles';
      case 'system-status':
        return 'Multi-Process Infrastructure & Health Status';
      case 'architecture':
        return 'System Architecture & Protocol Specifications';
      case 'profile':
        return 'User Settings & Account Security';
      case 'login':
        return 'Sign In to CSE Voice Hub';
      case 'register':
        return 'Create Research Account';
      default:
        return 'CSE Voice Hub';
    }
  };

  return (
    <header className="app-header">
      {/* Left: Mobile Menu Toggle & Clean Breadcrumb Hierarchy */}
      <div className="header-left">
        {onToggleMobileMenu && (
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={onToggleMobileMenu}
            title="Open navigation menu"
            aria-label="Open navigation menu"
          >
            <Icons.Menu size={18} />
          </button>
        )}
        <div className="header-breadcrumbs">
          <span
            className="crumb-root"
            onClick={() => onNavigate('overview')}
            style={{ cursor: 'pointer' }}
            title="Return to Overview"
          >
            CSE Voice Hub
          </span>
          <span className="crumb-separator">/</span>
          <span className="crumb-current">{getViewTitle(effectiveView)}</span>
        </div>
      </div>

      {/* Right: Truthful System State & User Account Controls */}
      <div className="header-right">
        {/* Live System Health Badge (truthful claim: Platform Ready / Backend Online) */}
        <div
          className="system-health-pill health-badge-header"
          onClick={() => onNavigate('system-status')}
          title="Click to view Multi-Process Infrastructure Status"
        >
          <span
            className={`status-dot ${
              isHealthy === true
                ? 'status-dot-online'
                : isHealthy === false
                ? 'status-dot-error'
                : 'status-dot-pending'
            }`}
          />
          <span className="health-label">
            {isHealthy === true
              ? 'Platform Ready'
              : isHealthy === false
              ? 'Backend Degraded'
              : 'Verifying Services...'}
          </span>
        </div>

        {/* User Account State */}
        {isAuthenticated && user ? (
          <div className="header-user-wrapper">
            <div
              className="header-user-btn"
              onClick={() => onNavigate('profile')}
              title="Open Profile Settings"
            >
              <div className="user-avatar-xs">
                {user.firstName ? user.firstName[0].toUpperCase() : 'U'}
              </div>
              <span className="user-name-header">
                {user.firstName} {user.lastName}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-xs ml-2"
              onClick={handleLogout}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="header-auth-buttons">
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => onNavigate('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className="btn btn-primary btn-xs ml-2"
              onClick={() => onNavigate('register')}
            >
              Register
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
