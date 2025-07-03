import React, { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import './Subscriber.css';

interface App {
  id: string;
  name: string;
  description?: string;
  version?: string;
  publisher?: string;
  // Add other app properties as needed
}

type TabType = 'home' | 'store';

const SubscriberComponent = (): React.JSX.Element => {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (activeTab === 'home') {
      fetchApps();
    }
  }, [activeTab]);

  const fetchApps = async (): Promise<void> => {
    setIsLoading(true);
    setError('');

    try {
      const session = await fetchAuthSession();
      const accessToken = session.tokens?.accessToken.toString();
      
      if (!accessToken) {
        throw new Error('No access token available');
      }

      const apiDomain = import.meta.env.VITE_API_GATEWAY_HTTPS_URL;
      if (!apiDomain) {
        throw new Error('API Gateway URL not configured');
      }

      const response = await fetch(`${apiDomain}/apps`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 200) {
        const data = await response.json();
        setApps(data.apps || data || []); // Handle different response structures
      } else if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.');
      } else if (response.status === 403) {
        throw new Error('You are not authorized to view apps.');
      } else if (response.status === 500) {
        throw new Error('Server error occurred. Please try again later.');
      } else {
        throw new Error(`Unexpected error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching apps:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch apps');
    } finally {
      setIsLoading(false);
    }
  };

  const renderHomeTab = (): React.JSX.Element => (
    <div className="tab-content">
      <h3>Available Apps</h3>
      {isLoading ? (
        <p>Loading apps...</p>
      ) : error ? (
        <div className="error-container">
          <p className="error">{error}</p>
          <button onClick={fetchApps} className="retry-button">
            Retry
          </button>
        </div>
      ) : apps.length > 0 ? (
        <div className="apps-grid">
          {apps.map((app) => (
            <div key={app.id} className="app-card">
              <h4>{app.name}</h4>
              {app.description && <p>{app.description}</p>}
              {app.version && <span className="app-version">v{app.version}</span>}
              {app.publisher && <span className="app-publisher">by {app.publisher}</span>}
            </div>
          ))}
        </div>
      ) : (
        <p>No apps available at the moment.</p>
      )}
    </div>
  );

  const renderStoreTab = (): React.JSX.Element => (
    <div className="tab-content">
      <h3>App Store</h3>
      <p>App store functionality coming soon...</p>
    </div>
  );

  return (
    <div className="auth-container">
      <div className="auth-card subscriber-container">
        <h2>Subscriber Dashboard</h2>
        
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            Home
          </button>
          <button
            className={`tab-button ${activeTab === 'store' ? 'active' : ''}`}
            onClick={() => setActiveTab('store')}
          >
            Store
          </button>
        </div>

        {activeTab === 'home' ? renderHomeTab() : renderStoreTab()}
      </div>
    </div>
  );
};

export default SubscriberComponent; 