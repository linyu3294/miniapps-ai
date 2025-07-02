import { getCurrentUser, fetchUserAttributes, fetchAuthSession } from 'aws-amplify/auth';
import { CognitoUser, getRolesFromGroups, Role } from '../types/auth';

export interface AuthState {
  isAuthenticated: boolean;
  user: CognitoUser | undefined;
  roles: Role;
}

export const checkAuthState = async (): Promise<AuthState> => {
  try {
    const currentUser = await getCurrentUser();
    const userAttributes = await fetchUserAttributes();
    const session = await fetchAuthSession();
    
    // Get user groups from the access token
    const accessToken = session.tokens?.accessToken.toString() || '';
    const payload = accessToken ? JSON.parse(atob(accessToken.split('.')[1])) : {};
    const groups = payload['cognito:groups'] || [];
    
    const user: CognitoUser = {
      ...currentUser,
      groups,
      signInDetails: {
        loginId: userAttributes.email
      }
    };
    
    const roles = getRolesFromGroups(groups);
    
    return {
      isAuthenticated: true,
      user,
      roles
    };
  } catch (error) {
    console.error('Auth state check failed:', error);
    return {
      isAuthenticated: false,
      user: undefined,
      roles: []
    };
  }
}; 