import { fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { Role } from '../types/auth';

export const updateUserRoles = async (roles: Role): Promise<void> => {
  const session = await fetchAuthSession();
  const accessToken = session.tokens?.accessToken.toString();
  
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const apiDomain = import.meta.env.VITE_API_GATEWAY_HTTPS_URL;
  if (!apiDomain) {
    throw new Error('API Gateway URL not configured');
  }

  const response = await fetch(`${apiDomain}/user-role`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      newRole: roles.map(role => role.toLowerCase())
    })
  });

  if (response.status === 200) {
    // Force token refresh to get updated roles
    try {
      await fetchAuthSession({ forceRefresh: true });
      await fetchUserAttributes(); // Refresh user attributes too
    } catch (refreshError) {
      console.warn('Failed to refresh tokens after role update:', refreshError);
    }
    return; // Success
  } else if (response.status === 401) {
    throw new Error('Authentication failed. Please sign in again.');
  } else if (response.status === 403) {
    throw new Error('You are not authorized to perform this action.');
  } else if (response.status === 500) {
    throw new Error('Server error occurred. Please try again later.');
  } else {
    throw new Error(`Unexpected error: ${response.status}`);
  }
}; 