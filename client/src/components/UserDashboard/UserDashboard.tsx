import React, { useState } from 'react';
import { signOut } from 'aws-amplify/auth';
import { Role, CognitoUser, getRoleDisplayText } from '../../types/auth';
import { updateUserRoles } from '../../services/roleService';
import RoleManager from '../RoleManager/RoleManager';
import '../Auth/Auth.css';

interface UserDashboardProps {
  user: CognitoUser;
  currentRoles: Role;
  onSignOut: () => void;
  onRolesUpdated: (newRoles: Role) => void;
}

const UserDashboard: React.FC<UserDashboardProps> = ({ 
  user, 
  currentRoles, 
  onSignOut, 
  onRolesUpdated 
}) => {
  const [isUpdatingRoles, setIsUpdatingRoles] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  const handleUpdateRoles = async (roles: Role): Promise<void> => {
    setIsUpdatingRoles(true);
    setError('');
    setMessage('');

    try {
      await updateUserRoles(roles);
      setMessage('Roles updated successfully! Please refresh the page to see changes.');
      onRolesUpdated(roles);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to update roles');
    } finally {
      setIsUpdatingRoles(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut();
      onSignOut();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sign out failed');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Welcome!</h2>
        <div className="user-info">
          <p><strong>User ID:</strong> {user.userId}</p>
          <p><strong>Email:</strong> {user.signInDetails?.loginId}</p>
          <p><strong>Current Role{currentRoles.length > 1 ? 's' : ''}:</strong> {getRoleDisplayText(currentRoles)}</p>
        </div>
        
        <RoleManager
          currentRoles={currentRoles}
          onRolesUpdate={handleUpdateRoles}
          isUpdating={isUpdatingRoles}
          error={error}
          message={message}
          onErrorChange={setError}
          onMessageChange={setMessage}
        />
        
        <button onClick={handleSignOut} className="auth-button signout">
          Sign Out
        </button>
      </div>
    </div>
  );
};

export default UserDashboard; 