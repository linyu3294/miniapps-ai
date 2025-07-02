export type Role = ('Subscriber' | 'Publisher')[];

export interface CognitoUser {
  username: string;
  userId: string;
  groups?: string[];
  signInDetails?: {
    loginId?: string;
  };
}

export interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  confirmationCode: string;
  selectedRoles: Role;
}

// Utility functions for role management
export const getRolesFromGroups = (groups: string[]): Role => {
  const hasPublisher = groups.includes('Publisher');
  const hasSubscriber = groups.includes('Subscriber');
  
  if (hasPublisher && hasSubscriber) {
    return ['Publisher', 'Subscriber'];
  } else if (hasPublisher) {
    return ['Publisher'];
  } else if (hasSubscriber) {
    return ['Subscriber'];
  }
  return []; 
};

export const hasRole = (userRoles: Role, role: 'Publisher' | 'Subscriber'): boolean => {
  return userRoles.includes(role);
};

export const getRoleDisplayText = (userRoles: Role): string => {
  const hasPublisher = hasRole(userRoles, 'Publisher');
  const hasSubscriber = hasRole(userRoles, 'Subscriber');
  
  if (hasPublisher && hasSubscriber) {
    return 'Publisher and Subscriber';
  } else if (hasPublisher) {
    return 'Publisher';
  } else if (hasSubscriber) {
    return 'Subscriber';
  }
  
  return 'No Assigned Roles';
};

// Utility function for handling role selection changes
export const updateRoleSelection = (
  currentRoles: Role,
  roleToToggle: 'Subscriber' | 'Publisher',
  checked: boolean
): Role => {
  let newRoles = [...currentRoles];
  
  if (checked) {
    if (!newRoles.includes(roleToToggle)) {
      newRoles.push(roleToToggle);
    }
  } else {
    newRoles = newRoles.filter(r => r !== roleToToggle);
    // Allow users to have no roles selected
  }
  
  // Sort to match Role type expectations
  newRoles.sort();
  
  return newRoles as Role;
}; 