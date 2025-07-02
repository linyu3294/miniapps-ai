import { getCurrentUser, fetchUserAttributes, fetchAuthSession, signOut } from 'aws-amplify/auth';
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
  } catch (error: any) {
    console.error('Auth state check failed:', error);
  
    if (error.name === 'UserUnauthenticatedException' || 
        error.message?.includes('User needs to be authenticated') ||
        error.message?.includes('Access Token has been revoked')) {
      console.log('User tokens are invalid, clearing authentication state...');
      try {
        await signOut({ global: true });
      } catch (signOutError) {
        console.warn('Failed to sign out during cleanup:', signOutError);
        localStorage.clear();
        sessionStorage.clear();
      }
    }
    
    return {
      isAuthenticated: false,
      user: undefined,
      roles: []
    };
  }
}; 