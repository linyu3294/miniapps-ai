import React, { useState, useEffect } from 'react';
import { checkAuthState } from '../../services/authService';
import './Subscriber.css';

const SubscriberComponent = (): React.JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSubscriber, setIsSubscriber] = useState<boolean>(false);

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async (): Promise<void> => {
    try {
      const authState = await checkAuthState();
      setIsAuthenticated(authState.isAuthenticated);
      setIsSubscriber(authState.roles.includes('Subscriber'));
    } catch (error) {
      setIsAuthenticated(false);
      setIsSubscriber(false);
      console.error('Auth check failed:', error);
    }
  };

  if (!isAuthenticated || !isSubscriber) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Access Denied</h2>
          <p>You need to be authenticated and have subscriber permissions to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Subscriber Dashboard</h2>
        <p>Welcome to the subscriber dashboard. Content coming soon...</p>
      </div>
    </div>
  );
};

export default SubscriberComponent; 