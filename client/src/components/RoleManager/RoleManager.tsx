import React, { useState, useEffect, ChangeEvent } from 'react';
import { Role, updateRoleSelection } from '../../types/auth';
import './RoleManager.css';

interface RoleManagerProps {
  currentRoles: Role;
  onRolesUpdate: (roles: Role) => Promise<void>;
  isUpdating?: boolean;
  error?: string;
  message?: string;
  onErrorChange?: (error: string) => void;
  onMessageChange?: (message: string) => void;
}

const RoleManager: React.FC<RoleManagerProps> = ({
  currentRoles,
  onRolesUpdate,
  isUpdating = false,
  error = '',
  message = '',
  onErrorChange,
  onMessageChange
}) => {
  const [selectedRoles, setSelectedRoles] = useState<Role>(currentRoles);

  useEffect(() => {
    setSelectedRoles(currentRoles);
  }, [currentRoles]);

  const handleRoleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { value, checked } = e.target;
    const role = value as 'Subscriber' | 'Publisher';
    
    setSelectedRoles(prev => updateRoleSelection(prev, role, checked));
    
    // Clear messages when user makes changes
    onErrorChange?.('');
    onMessageChange?.('');
  };

  const handleUpdateRoles = async (): Promise<void> => {
    await onRolesUpdate(selectedRoles);
  };

  return (
    <div className="role-management">
      <h3>Manage Your Roles</h3>
      <div className="form-group">
        <label>Select your role(s):</label>
        <div className="role-selection">
          <label className="checkbox-label">
            <input
              type="checkbox"
              value="Subscriber"
              checked={selectedRoles.includes('Subscriber')}
              onChange={handleRoleChange}
            />
            Subscriber - Browse and install apps
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              value="Publisher"
              checked={selectedRoles.includes('Publisher')}
              onChange={handleRoleChange}
            />
            Publisher - Upload and publish apps
          </label>
        </div>
      </div>
      <button 
        onClick={handleUpdateRoles} 
        className="auth-button"
        disabled={isUpdating}
      >
        {isUpdating ? 'Updating Roles...' : 'Update Roles'}
      </button>
      {error && <p className="error">{error}</p>}
      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default RoleManager; 