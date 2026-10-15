import React from 'react';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  onNavigateToLogin?: () => void;
  onNavigateToRegister?: () => void;
  onNavigateToDashboard?: () => void;
  onNavigateToProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigateToLogin,
  onNavigateToRegister,
  onNavigateToDashboard,
  onNavigateToProfile,
}) => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="header-container">
      <div className="header-brand" onClick={onNavigateToDashboard} style={{ cursor: 'pointer' }}>
        <div className="brand-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        </div>
        <div>
          <h1 className="brand-title">CSE Voice Hub</h1>
          <p className="brand-subtitle">Computer Engineering Department • Real-Time Audio Platform</p>
        </div>
      </div>

      <div className="header-right">
        <div className="phase-badge">
          <span className="pulse-dot"></span>
          Phase 1 — Auth & Users Active
        </div>

        {isAuthenticated && user ? (
          <div className="user-nav-box">
            <button className="user-profile-btn" onClick={onNavigateToProfile} title="View Profile">
              <span className="avatar-mini">
                {user.firstName.charAt(0)}{user.lastName.charAt(0)}
              </span>
              <span className="user-name-label">{user.firstName}</span>
            </button>
            <button className="btn-logout" onClick={() => logout()} title="Logout Session">
              Sign Out
            </button>
          </div>
        ) : (
          <div className="guest-nav-box">
            <button className="btn-sm btn-ghost" onClick={onNavigateToLogin}>
              Sign In
            </button>
            <button className="btn-sm btn-primary" onClick={onNavigateToRegister}>
              Register
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
