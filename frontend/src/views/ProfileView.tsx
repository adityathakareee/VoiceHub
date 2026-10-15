import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserIcon, ShieldCheckIcon, AlertCircleIcon, CheckCircle2Icon } from '../components/Icons';

interface ProfileViewProps {
  onRequireLogin: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onRequireLogin }) => {
  const { user, updateProfile, changePassword, isLoading, error, clearError } = useAuth();

  const [firstName, setFirstName] = useState<string>(user?.firstName || '');
  const [lastName, setLastName] = useState<string>(user?.lastName || '');
  const [department, setDepartment] = useState<string>(user?.department || '');
  const [profileMsg, setProfileMsg] = useState<string>('');

  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>('');
  const [passwordMsg, setPasswordMsg] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');

  if (!user) return null;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    clearError();

    try {
      await updateProfile({ firstName, lastName, department });
      setProfileMsg('Profile updated successfully.');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch (_err) {
      // Handled by AuthContext
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg('');
    setPasswordError('');
    clearError();

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMsg('Password changed successfully. Active session invalidated. Redirecting to login...');
      setTimeout(() => {
        onRequireLogin();
      }, 2000);
    } catch (err: any) {
      setPasswordError(err.message || 'Password change failed.');
    }
  };

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">User Account & Security</h1>
          <p className="view-subtitle">
            Manage your credentials, academic department affiliation, and security preferences.
          </p>
        </div>
      </div>

      <div className="profile-grid">
        {/* Profile Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-group">
              <UserIcon size={18} className="text-primary" />
              <h2 className="card-title">Profile Information</h2>
            </div>
            <span className="badge badge-info">{user.role}</span>
          </div>

          <div className="card-body">
            {profileMsg && (
              <div className="alert-banner alert-success mb-4">
                <CheckCircle2Icon size={16} />
                <span>{profileMsg}</span>
              </div>
            )}

            {error && (
              <div className="alert-banner alert-danger mb-4">
                <AlertCircleIcon size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="auth-form">
              <div className="form-group">
                <label>Institutional Email (Permanent)</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="input-disabled"
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="editFirstName">First Name</label>
                  <input
                    id="editFirstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="editLastName">Last Name</label>
                  <input
                    id="editLastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="editDepartment">Department</label>
                <input
                  id="editDepartment"
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                {isLoading ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </form>
          </div>
        </div>

        {/* Password Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title-group">
              <ShieldCheckIcon size={18} className="text-primary" />
              <h2 className="card-title">Security & Password</h2>
            </div>
          </div>

          <div className="card-body">
            {passwordMsg && (
              <div className="alert-banner alert-success mb-4">
                <CheckCircle2Icon size={16} />
                <span>{passwordMsg}</span>
              </div>
            )}

            {passwordError && (
              <div className="alert-banner alert-danger mb-4">
                <AlertCircleIcon size={16} />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="auth-form">
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmNewPassword">Confirm New Password</label>
                <input
                  id="confirmNewPassword"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="auth-role-policy mb-4">
                <span>⚠️ <strong>Security Notice:</strong> Changing your password invalidates your session cookie and requires immediate re-authentication.</span>
              </div>

              <button type="submit" className="btn btn-outline" disabled={isLoading}>
                {isLoading ? 'Updating Password...' : 'Update Password & Re-login'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
