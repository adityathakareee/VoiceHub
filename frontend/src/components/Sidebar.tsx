import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Icons } from './Icons';

export type NavViewMode =
  | 'overview'
  | 'rooms'
  | 'create-room'
  | 'room-detail'
  | 'network-monitor'
  | 'adaptive-transport'
  | 'system-status'
  | 'architecture'
  | 'roadmap'
  | 'profile'
  | 'login'
  | 'register';

export type NavItem = NavViewMode;

export interface SidebarProps {
  currentView?: NavViewMode;
  activeNav?: NavViewMode;
  onNavigate: (view: NavViewMode) => void;
  activeRoomCode?: string;
  isAudioConnected?: boolean;
  onOpenActiveRoom?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  activeNav,
  onNavigate,
  activeRoomCode,
  isAudioConnected = false,
  onOpenActiveRoom,
  isCollapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const effectiveView = activeNav || currentView || 'overview';

  const handleRoomClick = () => {
    if (onOpenActiveRoom) {
      onOpenActiveRoom();
    } else {
      onNavigate('room-detail');
    }
    if (onCloseMobile) onCloseMobile();
  };

  const handleNavClick = (view: NavViewMode) => {
    onNavigate(view);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`app-sidebar ${isCollapsed ? 'app-sidebar--collapsed' : 'app-sidebar--expanded'} ${
          mobileOpen ? 'app-sidebar--mobile-open' : ''
        }`}
        aria-label="Main Navigation"
      >
        {/* Brand Header */}
        <div className="sidebar-header">
          {!isCollapsed ? (
            <div className="sidebar-header-expanded">
              <div
                className="sidebar-brand"
                onClick={() => handleNavClick('overview')}
                style={{ cursor: 'pointer' }}
                title="CSE Voice Hub — Overview"
              >
                <div className="brand-icon-box">CVH</div>
                <div className="brand-meta">
                  <div className="brand-title">CSE Voice Hub</div>
                  <div className="brand-subtitle">Adaptive UDP Audio System</div>
                  <div className="brand-descriptor">REAL-TIME RESEARCH PLATFORM</div>
                </div>
              </div>
              {onToggleCollapse && (
                <button
                  type="button"
                  className="sidebar-collapse-btn"
                  onClick={onToggleCollapse}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <Icons.ChevronLeft size={16} />
                </button>
              )}
            </div>
          ) : (
            <div className="sidebar-header-collapsed">
              <div
                className="brand-icon-box brand-icon-box--collapsed"
                onClick={() => handleNavClick('overview')}
                title="CSE Voice Hub — Real-Time Audio Research Platform"
              >
                CVH
              </div>
              {onToggleCollapse && (
                <button
                  type="button"
                  className="sidebar-collapse-btn sidebar-collapse-btn--collapsed"
                  onClick={onToggleCollapse}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <Icons.ChevronRight size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation Sections */}
        <nav className="sidebar-nav">
          {/* Main Platform Section */}
          {!isCollapsed && <div className="sidebar-section-label">Main Platform</div>}

          <button
            type="button"
            className={`nav-item-btn ${effectiveView === 'overview' ? 'active' : ''}`}
            onClick={() => handleNavClick('overview')}
            title={isCollapsed ? 'Overview & System Dashboard' : undefined}
          >
            <Icons.Overview className="nav-icon" size={17} />
            {!isCollapsed && <span>Overview</span>}
          </button>

          <button
            type="button"
            className={`nav-item-btn ${
              effectiveView === 'rooms' || effectiveView === 'create-room' ? 'active' : ''
            }`}
            onClick={() => handleNavClick('rooms')}
            title={isCollapsed ? 'Conference Rooms Directory' : undefined}
          >
            <Icons.Rooms className="nav-icon" size={17} />
            {!isCollapsed && <span>Conference Rooms</span>}
          </button>

          {activeRoomCode && (
            <button
              type="button"
              className={`nav-item-btn nav-item-btn--active-room ${
                effectiveView === 'room-detail' ? 'active' : ''
              }`}
              onClick={handleRoomClick}
              title={
                isCollapsed
                  ? `Active Room: ${activeRoomCode} (${isAudioConnected ? 'LIVE' : 'READY'})`
                  : undefined
              }
            >
              <Icons.Mic className="nav-icon" size={17} />
              {!isCollapsed && (
                <>
                  <span className="truncate">Active Room</span>
                  <span
                    className={`nav-badge ${isAudioConnected ? 'badge-success' : 'badge-info'}`}
                  >
                    {isAudioConnected ? 'LIVE' : activeRoomCode}
                  </span>
                </>
              )}
            </button>
          )}

          {/* Engineering Telemetry Section */}
          {!isCollapsed && <div className="sidebar-section-label">Engineering Telemetry</div>}
          {isCollapsed && <div className="sidebar-divider" />}

          <button
            type="button"
            className={`nav-item-btn ${effectiveView === 'network-monitor' ? 'active' : ''}`}
            onClick={() => handleNavClick('network-monitor')}
            title={isCollapsed ? 'Network Telemetry & Metrics' : undefined}
          >
            <Icons.Network className="nav-icon" size={17} />
            {!isCollapsed && <span>Network Monitor</span>}
          </button>

          <button
            type="button"
            className={`nav-item-btn ${effectiveView === 'adaptive-transport' ? 'active' : ''}`}
            onClick={() => handleNavClick('adaptive-transport')}
            title={isCollapsed ? 'Adaptive UDP Rate Control & Profiles' : undefined}
          >
            <Icons.Adaptive className="nav-icon" size={17} />
            {!isCollapsed && <span>Adaptive Transport</span>}
          </button>

          <button
            type="button"
            className={`nav-item-btn ${effectiveView === 'system-status' ? 'active' : ''}`}
            onClick={() => handleNavClick('system-status')}
            title={isCollapsed ? 'Multi-Process System Health' : undefined}
          >
            <Icons.Status className="nav-icon" size={17} />
            {!isCollapsed && <span>System Status</span>}
          </button>

          {/* Research & Specs Section */}
          {!isCollapsed && <div className="sidebar-section-label">Research & Specs</div>}
          {isCollapsed && <div className="sidebar-divider" />}

          <button
            type="button"
            className={`nav-item-btn ${effectiveView === 'architecture' ? 'active' : ''}`}
            onClick={() => handleNavClick('architecture')}
            title={isCollapsed ? 'Architecture & Protocol Spec' : undefined}
          >
            <Icons.Architecture className="nav-icon" size={17} />
            {!isCollapsed && <span>Architecture Spec</span>}
          </button>
        </nav>

        {/* User Profile Footer */}
        {isAuthenticated && user && (
          <div className={`sidebar-footer ${isCollapsed ? 'sidebar-footer--collapsed' : ''}`}>
            {!isCollapsed ? (
              <>
                <div
                  className={`sidebar-user-pill ${effectiveView === 'profile' ? 'active' : ''}`}
                  onClick={() => handleNavClick('profile')}
                  title="Manage User Profile & Password"
                >
                  <div className="user-avatar-sm">
                    {user.firstName ? user.firstName[0].toUpperCase() : 'U'}
                  </div>
                  <div className="user-info-text">
                    <div className="user-name truncate">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="user-role truncate">{user.role}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-icon-logout"
                  onClick={logout}
                  title="Sign Out of Session"
                  aria-label="Sign Out"
                >
                  <Icons.LogOut size={16} />
                </button>
              </>
            ) : (
              <div className="sidebar-footer-collapsed-user">
                <div
                  className="user-avatar-sm"
                  onClick={() => handleNavClick('profile')}
                  title={`${user.firstName} ${user.lastName} (${user.role})`}
                  style={{ cursor: 'pointer' }}
                >
                  {user.firstName ? user.firstName[0].toUpperCase() : 'U'}
                </div>
                <button
                  type="button"
                  className="btn-icon-logout"
                  onClick={logout}
                  title="Sign Out"
                  aria-label="Sign Out"
                  style={{ marginTop: '0.4rem' }}
                >
                  <Icons.LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        )}

        {!isAuthenticated && (
          <div className={`sidebar-footer-auth ${isCollapsed ? 'sidebar-footer-auth--collapsed' : ''}`}>
            {!isCollapsed ? (
              <button
                type="button"
                className="btn btn-primary btn-sm btn-block"
                onClick={() => handleNavClick('login')}
              >
                Sign In to Platform
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm btn-icon-only"
                onClick={() => handleNavClick('login')}
                title="Sign In"
                aria-label="Sign In"
              >
                <Icons.User size={15} />
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
};
