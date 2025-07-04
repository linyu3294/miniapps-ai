import React, { useState, useEffect } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import './Subscriber.css';

interface App {
  appId: string;
  appSlug: string;
  appName: string;
  appDescription: string;
  publisherId: string;
  uploadTimestamp: string;
  versionNumber: number;
  manifestContent?: string;
}

interface AppListResponse {
  apps: App[];
  count: number;
  nextCursor?: string;
}

type TabType = 'home' | 'store';

const SubscriberComponent = (): React.JSX.Element => {
  const [activeTab, setActiveTab] = useState<TabType>('store');
  const [apps, setApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<string[]>([]);
  const [page, setPage] = useState(1);
      const limit = 12;

  useEffect(() => {
    if (activeTab === 'store') {
      fetchApps(cursor);
    }
  }, [activeTab, cursor]);

  const fetchApps = async (cursorParam: string | null): Promise<void> => {
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

      let url = `${apiDomain}/apps?limit=${limit}`;
      if (cursorParam) {
        url += `&cursor=${encodeURIComponent(cursorParam)}`;
      }

      console.log('Request URL:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 200) {
        const data: AppListResponse = await response.json();
        setApps(data.apps || []);
        setNextCursor(data.nextCursor || null);
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

  const handleNext = () => {
    if (nextCursor) {
      setPrevCursors(prev => [...prev, cursor || '']);
      setCursor(nextCursor);
      setPage(p => p + 1);
    }
  };

  const handlePrev = () => {
    if (prevCursors.length > 0) {
      const prev = [...prevCursors];
      const prevCursor = prev.pop() || null;
      setPrevCursors(prev);
      setCursor(prevCursor);
      setPage(p => p - 1);
    }
  };

  const renderHomeTab = (): React.JSX.Element => (
    <div className="tab-content">
      <h3>App Store</h3>
      <p>App store functionality coming soon...</p>
    </div>
  );

  const renderStoreTab = (): React.JSX.Element => (
    <div className="tab-content">
      <h3>Available Apps</h3>
      {isLoading ? (
        <div className="loading-container">
          <p>Loading apps...</p>
        </div>
      ) : error ? (
        <div className="error-container">
          <p className="error">{error}</p>
          <button onClick={() => fetchApps(cursor)} className="retry-button">
            Retry
          </button>
        </div>
      ) : apps.length > 0 ? (
        <>
          <div className="cards-grid">
            {apps.map((app) => (
              <div key={app.appId} className="app-card">
                <div className="app-card-content">
                  <h4>{app.appName}</h4>
                  {app.appDescription && <p>{app.appDescription}</p>}
                  <div className="app-meta">
                    <span className="app-version">v{app.versionNumber}</span>
                    <span className="app-publisher">by {app.publisherId}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="pagination">
            <button 
              className="pagination-link" 
              onClick={handlePrev} 
              disabled={page === 1 || isLoading}
            >
              &lt;&lt; Previous
            </button>
            <span className="pagination-link">Page {page}</span>
            <button 
              className="pagination-link" 
              onClick={handleNext} 
              disabled={!nextCursor || isLoading}
            >
              Next &gt;&gt;
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>No apps available at the moment.</p>
        </div>
      )}
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