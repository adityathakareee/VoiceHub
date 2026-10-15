import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircleIcon, ArrowRightIcon, ArrowLeftIcon } from '../components/Icons';

interface RegisterViewProps {
  onSuccess: () => void;
  onNavigateToLogin: () => void;
  onNavigateToOverview?: () => void;
}

export const RegisterView: React.FC<RegisterViewProps> = ({
  onSuccess,
  onNavigateToLogin,
  onNavigateToOverview,
}) => {
  const { register, isLoading, error, clearError } = useAuth();
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [department, setDepartment] = useState<string>('Computer Science & Engineering');
  const [validationError, setValidationError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    setSuccessMsg('');
    clearError();

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters long.');
      return;
    }

    try {
      await register({
        firstName,
        lastName,
        email,
        password,
        department,
      });
      setSuccessMsg('Account registered successfully! Redirecting to login...');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (_err) {
      // Error handled by AuthContext
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
      <div className="auth-card" style={{ maxWidth: '480px' }}>
        <div className="auth-card-header">
          <h2 className="auth-card-title">Register Account</h2>
          <p className="auth-card-desc">Create your student or researcher credentials</p>
        </div>

        {(validationError || error) && (
          <div className="alert-banner alert-danger">
            <AlertCircleIcon size={16} />
            <span>{validationError || error}</span>
          </div>
        )}

        {successMsg && (
          <div className="alert-banner alert-success">
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="firstName" className="form-label-top">
                First Name
              </label>
              <input
                id="firstName"
                type="text"
                className="form-control auth-input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Aditya"
                required
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="lastName" className="form-label-top">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                className="form-control auth-input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Sharma"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email" className="form-label-top">
              Institutional Email
            </label>
            <input
              id="email"
              type="email"
              className="form-control auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. aditya@vit.edu"
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="department" className="form-label-top">
              Academic Department
            </label>
            <input
              id="department"
              type="text"
              className="form-control auth-input"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Computer Science & Engineering"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-grid-2">
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
                placeholder="Min 8 characters"
                required
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label-top">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="form-control auth-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="auth-role-policy">
            <span>🛡️ Standard registrations provision <code>STUDENT</code> credentials. Faculty/Admin privileges are assigned institutionally.</span>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block auth-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner-sm" /> Creating Account...
              </>
            ) : (
              <>
                <span>Register Account</span>
                <ArrowRightIcon size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-card-footer">
          <p>
            Already have an account?{' '}
            <button
              type="button"
              className="auth-link-btn"
              onClick={onNavigateToLogin}
            >
              Sign In Here
            </button>
          </p>
        </div>
      </div>

      <div className="auth-security-note">
        <span>🔒 Secure session authentication • HttpOnly JWT & bcrypt password hashing</span>
      </div>
    </div>
  );
};
