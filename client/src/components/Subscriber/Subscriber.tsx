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
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [apps, setApps] = useState<App[]>([]);
  const [subscribedApps, setSubscribedApps] = useState<App[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingSubscribed, setIsLoadingSubscribed] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [subscribedError, setSubscribedError] = useState<string>('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [subscribedCursor, setSubscribedCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [subscribedNextCursor, setSubscribedNextCursor] = useState<string | null>(null);
  const [prevCursors, setPrevCursors] = useState<string[]>([]);
  const [subscribedPrevCursors, setSubscribedPrevCursors] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [subscribedPage, setSubscribedPage] = useState(1);
  const [subscribingApps, setSubscribingApps] = useState<Set<string>>(new Set());
  const [subscriptionErrors, setSubscriptionErrors] = useState<Map<string, string>>(new Map());
  const limit = 12;

  useEffect(() => {
    if (activeTab === 'store') {
      fetchApps(cursor, false);
    } else if (activeTab === 'home') {
      fetchApps(subscribedCursor, true);
    }
  }, [activeTab, cursor, subscribedCursor]);

  const fetchApps = async (cursorParam: string | null, getSubscribed: boolean = false): Promise<void> => {
    if (getSubscribed) {
      setIsLoadingSubscribed(true);
      setSubscribedError('');
    } else {
      setIsLoading(true);
      setError('');
    }

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
      if (getSubscribed) {
        url += '&getSubscribed=true';
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
        if (getSubscribed) {
          setSubscribedApps(data.apps || []);
          setSubscribedNextCursor(data.nextCursor || null);
        } else {
          setApps(data.apps || []);
          setNextCursor(data.nextCursor || null);
        }
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch apps';
      if (getSubscribed) {
        setSubscribedError(errorMessage);
      } else {
        setError(errorMessage);
      }
    } finally {
      if (getSubscribed) {
        setIsLoadingSubscribed(false);
      } else {
        setIsLoading(false);
      }
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

  const handleSubscribedNext = () => {
    if (subscribedNextCursor) {
      setSubscribedPrevCursors(prev => [...prev, subscribedCursor || '']);
      setSubscribedCursor(subscribedNextCursor);
      setSubscribedPage(p => p + 1);
    }
  };

  const handleSubscribedPrev = () => {
    if (subscribedPrevCursors.length > 0) {
      const prev = [...subscribedPrevCursors];
      const prevCursor = prev.pop() || null;
      setSubscribedPrevCursors(prev);
      setSubscribedCursor(prevCursor);
      setSubscribedPage(p => p - 1);
    }
  };

  const handleSubscribe = async (appId: string): Promise<void> => {
    setSubscribingApps(prev => new Set([...prev, appId]));
    setSubscriptionErrors(prev => {
      const newErrors = new Map(prev);
      newErrors.delete(appId);
      return newErrors;
    });

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

      const url = `${apiDomain}/subscribe?appID=${appId}`;
      console.log('Subscribe URL:', url);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 200) {
        console.log(`Successfully subscribed to app: ${appId}`);
        // You might want to show a success message or update the UI here
      } else if (response.status === 401) {
        throw new Error('Authentication failed. Please sign in again.');
      } else if (response.status === 403) {
        throw new Error('You are not authorized to subscribe to this app.');
      } else if (response.status === 409) {
        throw new Error('You are already subscribed to this app.');
      } else if (response.status === 500) {
        throw new Error('Server error occurred. Please try again later.');
      } else {
        throw new Error(`Unexpected error: ${response.status}`);
      }
    } catch (error) {
      console.error('Error subscribing to app:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to subscribe to app';
      setSubscriptionErrors(prev => new Map([...prev, [appId, errorMessage]]));
    } finally {
      setSubscribingApps(prev => {
        const newSet = new Set(prev);
        newSet.delete(appId);
        return newSet;
      });
    }
  };

  const renderHomeTab = (): React.JSX.Element => (
    <div className="tab-content">
      <h3>My Subscribed Apps</h3>
      {isLoadingSubscribed ? (
        <div className="loading-container">
          <p>Loading subscribed apps...</p>
        </div>
      ) : subscribedError ? (
        <div className="error-container">
          <p className="error">{subscribedError}</p>
          <button onClick={() => fetchApps(subscribedCursor, true)} className="retry-button">
            Retry
          </button>
        </div>
      ) : subscribedApps.length > 0 ? (
        <>
          <div className="cards-grid">
            {subscribedApps.map((app) => (
              <div key={app.appId} className="app-card">
                <div className="app-card-content">
                  <h4>{app.appName}</h4>
                  {app.appDescription && <p>{app.appDescription}</p>}
                  <div className="app-meta">
                    <span className="app-version">v{app.versionNumber}</span>
                    <span className="app-publisher">by {app.publisherId}</span>
                  </div>
                  <div className="app-actions">
                    <button className="subscribed-button" disabled>
                      Subscribed
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="pagination">
            <button 
              className="pagination-link" 
              onClick={handleSubscribedPrev} 
              disabled={subscribedPage === 1 || isLoadingSubscribed}
            >
              &lt;&lt; Previous
            </button>
            <span className="pagination-link">Page {subscribedPage}</span>
            <button 
              className="pagination-link" 
              onClick={handleSubscribedNext} 
              disabled={!subscribedNextCursor || isLoadingSubscribed}
            >
              Next &gt;&gt;
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <p>You haven't subscribed to any apps yet. Visit the Store tab to discover and subscribe to apps.</p>
        </div>
      )}
    </div>
  );

  const renderStoreTab = (): React.JSX.Element => (
    <div className="tab-content">
      {isLoading ? (
        <div className="loading-container">
          <p>Loading apps...</p>
        </div>
      ) : error ? (
        <div className="error-container">
          <p className="error">{error}</p>
          <button onClick={() => fetchApps(cursor, false)} className="retry-button">
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
                  <div className="app-actions">
                    <button
                      className="subscribe-button"
                      onClick={() => handleSubscribe(app.appId)}
                      disabled={subscribingApps.has(app.appId)}
                    >
                      {subscribingApps.has(app.appId) ? 'Subscribing...' : 'Subscribe'}
                    </button>
                  </div>
                  {subscriptionErrors.has(app.appId) && (
                    <div className="subscription-error">
                      <p className="error-text">{subscriptionErrors.get(app.appId)}</p>
                    </div>
                  )}
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