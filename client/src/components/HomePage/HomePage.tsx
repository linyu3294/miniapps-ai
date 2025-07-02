import React, { useState, useEffect } from 'react';
import Auth from '../Auth/Auth';
import PublisherComponent from '../Publisher/Publisher';
import SubscriberComponent from '../Subscriber/Subscriber';
import UserDashboard from '../UserDashboard/UserDashboard';
import NavBar from '../NavBar/NavBar';
import { Role, CognitoUser } from '../../types/auth';
import { checkAuthState } from '../../services/authService';
import './HomePage.css';

const HomePage = (): React.JSX.Element => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isPublisher, setIsPublisher] = useState<boolean>(false);
  const [isSubscriber, setIsSubscriber] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'auth' | 'publisher' | 'subscriber'>('auth');
  const [user, setUser] = useState<CognitoUser | undefined>(undefined);
  const [currentRoles, setCurrentRoles] = useState<Role>([]);

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async (): Promise<void> => {
    try {
      const authState = await checkAuthState();
      setIsAuthenticated(authState.isAuthenticated);
      setUser(authState.user);
      setCurrentRoles(authState.roles);
      
      if (authState.isAuthenticated) {
        setIsPublisher(authState.roles.includes('Publisher'));
        setIsSubscriber(authState.roles.includes('Subscriber'));
        
        // Auto-switch to appropriate view based on user role
        if (authState.roles.includes('Publisher')) {
          setCurrentView('publisher');
        } else if (authState.roles.includes('Subscriber')) {
          setCurrentView('subscriber');
        }
      } else {
        setIsPublisher(false);
        setIsSubscriber(false);
        setCurrentView('auth');
      }
    } catch (error) {
      setIsAuthenticated(false);
      setIsPublisher(false);
      setIsSubscriber(false);
      setUser(undefined);
      setCurrentRoles([]);
      setCurrentView('auth');
    }
  };

  const handleRolesUpdated = (newRoles: Role): void => {
    setCurrentRoles(newRoles);
    setIsPublisher(newRoles.includes('Publisher'));
    setIsSubscriber(newRoles.includes('Subscriber'));
  };

  const handleSignOut = (): void => {
    setIsAuthenticated(false);
    setIsPublisher(false);
    setIsSubscriber(false);
    setUser(undefined);
    setCurrentRoles([]);
    setCurrentView('auth');
  };

  if (!isAuthenticated) {
    return <Auth onAuthenticationComplete={checkAuthentication} />;
  }

    return (
    <div className="home-page">
      <NavBar
        currentView={currentView}
        setCurrentView={setCurrentView}
        isPublisher={isPublisher}
        isSubscriber={isSubscriber}
      />
      
      <main className="main-content">
        {currentView === 'auth' ? (
          isAuthenticated && user ? (
            <UserDashboard
              user={user}
              currentRoles={currentRoles}
              onSignOut={handleSignOut}
              onRolesUpdated={handleRolesUpdated}
              onAuthRefresh={checkAuthentication}
            />
          ) : (
            <Auth />
          )
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