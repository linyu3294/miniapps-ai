import React, { useEffect, useState } from "react";

function App() {
  const [slug, setSlug] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    // Extract slug from URL: /app/:slug/
    const match = window.location.pathname.match(/^\/app\/([^/]+)\/?/);
    if (match) {
      setSlug(match[1]);
      setLoading(true);
      setError(null);
      
      // Fetch manifest.json from the /app/* path, which is routed by CloudFront
      fetch(`/app/${match[1]}/manifest.json`)
        .then(res => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          setManifest(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load manifest:', err);
          setError(err.message);
          setLoading(false);
        });
    }
    // Listen for the beforeinstallprompt event
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          console.log("User accepted the install prompt");
        } else {
          console.log("User dismissed the install prompt");
        }
        setDeferredPrompt(null);
        setShowInstall(false);
      });
    }
  };

  if (!slug) return <div>No app selected.</div>;
  if (loading) return <div>Loading app...</div>;
  if (error) return <div>Error loading app: {error}</div>;
  if (!manifest) return <div>No manifest found.</div>;

  return (
    <div>
      <h1>{manifest.name}</h1>
      {/* Show install button if prompt is available */}
      {showInstall && (
        <div style={{margin: '16px 0'}}>
          <button onClick={handleInstallClick} style={{padding: '12px 24px', fontSize: '1.2em', borderRadius: '8px', background: '#0078d7', color: '#fff', border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'}}>Install App</button>
          <div style={{fontSize: '0.95em', marginTop: '8px', color: '#555'}}>Install this app for a better experience and offline support.</div>
        </div>
      )}
      {/* Dynamically load and render app UI, model, etc. */}
      {/* Example: <script src={`/app/${slug}/ui.js`} /> */}
    </div>
  );
}

export default App;
