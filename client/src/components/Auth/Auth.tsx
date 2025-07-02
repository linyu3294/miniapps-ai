import React, { useState, useEffect } from 'react';
import { Role, CognitoUser } from '../../types/auth';
import { checkAuthState } from '../../services/authService';
import LoginPage from '../LoginPage/LoginPage';
import SignUpPage from '../SignUpPage/SignUpPage';
import './Auth.css';

type AuthView = 'login' | 'signup';

interface AuthProps {
  onAuthenticationComplete?: () => void;
}

const Auth: React.FC<AuthProps> = ({ onAuthenticationComplete }) => {
  const [, setIsAuthenticated] = useState<boolean>(false);
  const [, setUser] = useState<CognitoUser | undefined>(undefined);
  const [, setCurrentRoles] = useState<Role>(['Subscriber']);
  const [currentView, setCurrentView] = useState<AuthView>('login');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const authState = await checkAuthState();
      setIsAuthenticated(authState.isAuthenticated);
      setUser(authState.user);
      setCurrentRoles(authState.roles);
    } catch (error) {
      console.error('Authentication check failed:', error);
      setIsAuthenticated(false);
      setUser(undefined);
      setCurrentRoles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = async (): Promise<void> => {
    await checkAuthentication();
    // Notify HomePage that authentication is complete
    if (onAuthenticationComplete) {
      onAuthenticationComplete();
    }
  };

  const handleSignUpSuccess = (): void => {
    setCurrentView('login');
  };

  const switchToSignUp = (): void => {
    setCurrentView('signup');
  };

  const switchToLogin = (): void => {
    setCurrentView('login');
  };

  if (isLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (currentView === 'signup') {
    return (
      <SignUpPage
        onSignUpSuccess={handleSignUpSuccess}
        onSwitchToLogin={switchToLogin}
      />
    );
  }

  return (
    <LoginPage
      onLoginSuccess={handleLoginSuccess}
      onSwitchToSignUp={switchToSignUp}
    />
  );
};

export default Auth; 