import React from 'react';
import './NavBar.css';

interface NavBarProps {
  currentView: 'auth' | 'publisher' | 'subscriber';
  setCurrentView: (view: 'auth' | 'publisher' | 'subscriber') => void;
  isPublisher: boolean;
  isSubscriber: boolean;
}

const NavBar: React.FC<NavBarProps> = ({ 
  currentView, 
  setCurrentView, 
  isPublisher, 
  isSubscriber 
}) => {
  return (
    <nav className="nav-bar">
      <div className="nav-content">
        <h1>MiniApps AI</h1>
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
        </div>
      </div>
    </nav>
  );
};

export default NavBar; 