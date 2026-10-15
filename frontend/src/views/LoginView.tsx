import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircleIcon, ArrowRightIcon, ArrowLeftIcon } from '../components/Icons';

interface LoginViewProps {
  onSuccess: () => void;
  onNavigateToRegister: () => void;
  onNavigateToOverview?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onSuccess,
  onNavigateToRegister,
  onNavigateToOverview,
}) => {
  const { login, isLoading, error, clearError } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    clearError();

    if (!email.trim() || !password) {
      setFormError('Please enter both email address and password.');
      return;
    }

    try {
      await login(email, password);
      onSuccess();
    } catch (_err: any) {
      // Error handled by AuthContext and displayed in banner
    }
  };

  return (
    <div className="auth-dedicated-container">
      {onNavigateToOverview && (
        <button
          type="button"
          className="auth-back-nav-btn"
          onClick={onNavigateToOverview}
          title="Return to Public Overview"
        >
          <ArrowLeftIcon size={15} />
          <span>Return to Platform Overview</span>
        </button>
      )}

      {/* Brand Header */}
      <div className="auth-brand-masthead">
        <div className="brand-icon-box brand-icon-box--lg">CVH</div>
        <h1 className="auth-brand-title">CSE Voice Hub</h1>
        <p className="auth-brand-subtitle">Adaptive UDP Audio System</p>
        <span className="auth-brand-tag">REAL-TIME RESEARCH PLATFORM</span>
      </div>

      {/* Auth Card */}
      <div className="auth-card">
        <div className="auth-card-header">
          <h2 className="auth-card-title">Sign In</h2>
          <p className="auth-card-desc">Enter your institutional credentials to continue</p>
        </div>

        {(formError || error) && (
          <div className="alert-banner alert-danger">
            <AlertCircleIcon size={16} />
            <span>{formError || error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email" className="form-label-top">
              Institutional Email Address
            </label>
            <input
              id="email"
              type="email"
              className="form-control auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. aditya@vit.edu or admin@cse.voicehub.edu"
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label-top">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-control auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block auth-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner-sm" /> Authenticating Session...
              </>
            ) : (
              <>
                <span>Sign In to Platform</span>
                <ArrowRightIcon size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-card-footer">
          <p>
            Do not have an account?{' '}
            <button
              type="button"
              className="auth-link-btn"
              onClick={onNavigateToRegister}
            >
              Register New Account
            </button>
          </p>
        </div>
      </div>

      {/* Security Note */}
      <div className="auth-security-note">
        <span>🔒 Secure session authentication • HttpOnly JWT & bcrypt password hashing</span>
      </div>
    </div>
  );
};
