import React, { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import './Subscriber.css';

const SubscriberComponent = (): React.JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSubscriber, setIsSubscriber] = useState<boolean>(false);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async (): Promise<void> => {
    try {
      const session = await fetchAuthSession();
      const accessToken = session.tokens?.accessToken.toString() || '';
      const payload = accessToken ? JSON.parse(atob(accessToken.split('.')[1])) : {};
      const groups = payload['cognito:groups'] || [];
      
      setIsAuthenticated(true);
      setIsSubscriber(groups.includes('Subscriber'));
    } catch (error) {
      setIsAuthenticated(false);
      setIsSubscriber(false);
      console.error('Auth check failed:', error);
    }
  };

  if (!isAuthenticated || !isSubscriber) {
    return (
      <div className="subscriber-container">
        <div className="subscriber-card">
          <h2>Access Denied</h2>
          <p>You need to be authenticated and have subscriber permissions to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="subscriber-container">
      <div className="subscriber-card">
        <h2>Subscriber Dashboard</h2>
        <p>Welcome to the subscriber dashboard. Content coming soon...</p>
      </div>
    </div>
  );
};

export default SubscriberComponent; 