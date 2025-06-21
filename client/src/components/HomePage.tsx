import React, { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import AuthComponent from './Auth';
import PublisherComponent from './Publisher';
import './HomePage.css';

const HomePage = (): React.JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isPublisher, setIsPublisher] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'auth' | 'publisher'>('auth');

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
      
      // Auto-switch to publisher view if user is authenticated and is a publisher
      if (groups.includes('Publisher')) {
        setCurrentView('publisher');
      }
    } catch (error) {
      setIsAuthenticated(false);
      setIsPublisher(false);
      setCurrentView('auth');
    }
  };

  const handleSignOut = (): void => {
    setIsAuthenticated(false);
    setIsPublisher(false);
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
            {isPublisher && (
              <>
                <button 
                  className={`nav-button ${currentView === 'auth' ? 'active' : ''}`}
                  onClick={() => setCurrentView('auth')}
                >
                  Profile
                </button>
                <button 
                  className={`nav-button ${currentView === 'publisher' ? 'active' : ''}`}
                  onClick={() => setCurrentView('publisher')}
                >
                  Publisher
                </button>
              </>
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
        ) : (
          <PublisherComponent />
        )}
      </main>
    </div>
  );
};

export default HomePage; 