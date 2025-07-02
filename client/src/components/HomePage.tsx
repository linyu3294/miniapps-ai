import React, { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import AuthComponent from './Auth';
import PublisherComponent from './Publisher';
import SubscriberComponent from './Subscriber';
import './HomePage.css';

const HomePage = (): React.JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isPublisher, setIsPublisher] = useState<boolean>(false);
  const [isSubscriber, setIsSubscriber] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'auth' | 'publisher' | 'subscriber'>('auth');

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
      setIsPublisher(groups.includes('Publisher'));
      setIsSubscriber(groups.includes('Subscriber'));
      
      // Auto-switch to appropriate view based on user role
      if (groups.includes('Publisher')) {
        setCurrentView('publisher');
      } else if (groups.includes('Subscriber')) {
        setCurrentView('subscriber');
      }
    } catch (error) {
      setIsAuthenticated(false);
      setIsPublisher(false);
      setIsSubscriber(false);
      setCurrentView('auth');
    }
  };

  const handleSignOut = (): void => {
    setIsAuthenticated(false);
    setIsPublisher(false);
    setIsSubscriber(false);
    setCurrentView('auth');
  };

  if (!isAuthenticated) {
    return <AuthComponent />;
  }

  return (
    <div className="home-page">
      <nav className="nav-bar">
        <div className="nav-content">
          <h1>MiniApps AI Publisher</h1>
          <div className="nav-buttons">
            {(isPublisher || isSubscriber) && (
              <button 
                className={`nav-button ${currentView === 'auth' ? 'active' : ''}`}
                onClick={() => setCurrentView('auth')}
              >
                Profile
              </button>
            )}
            {isPublisher && (
              <button 
                className={`nav-button ${currentView === 'publisher' ? 'active' : ''}`}
                onClick={() => setCurrentView('publisher')}
              >
                Publisher
              </button>
            )}
            {isSubscriber && (
              <button 
                className={`nav-button ${currentView === 'subscriber' ? 'active' : ''}`}
                onClick={() => setCurrentView('subscriber')}
              >
                Subscriber
              </button>
            )}
            <button className="nav-button signout" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      
      <main className="main-content">
        {currentView === 'auth' ? (
          <AuthComponent />
        ) : currentView === 'publisher' ? (
          <PublisherComponent />
        ) : (
          <SubscriberComponent />
        )}
      </main>
    </div>
  );
};

export default HomePage; 