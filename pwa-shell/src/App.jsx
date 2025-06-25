import React, { useEffect, useState } from "react";

function App() {
  const [slug, setSlug] = useState(null);
  const [manifest, setManifest] = useState(null);

  useEffect(() => {
    // Extract slug from URL: /app/:slug/
    const match = window.location.pathname.match(/^\/app\/([^/]+)\/?/);
    if (match) {
      setSlug(match[1]);
      // Fetch manifest.json from the /app/* path, which is routed by CloudFront
      fetch(`/app/${match[1]}/manifest.json`)
        .then(res => res.json())
        .then(setManifest);
    }
  }, []);

  if (!slug) return <div>No app selected.</div>;
  if (!manifest) return <div>Loading app...</div>;

  return (
    <div>
      <h1>{manifest.name}</h1>
      {/* Dynamically load and render app UI, model, etc. */}
      {/* Example: <script src={`/app/${slug}/ui.js`} /> */}
    </div>
  );
}

export default App; 