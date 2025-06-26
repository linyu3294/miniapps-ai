// ... existing imports ...
import React, { useEffect, useState } from "react";

function getSlugFromSubdomain() {
  // e.g., shape.miniprograms.app → ['shape', 'miniprograms', 'app']
  const parts = window.location.hostname.split(".");
  // Assumes: {slug}.miniprograms.app
  if (parts.length < 3) return null;
  return parts[0];
}

const App = () => {
  const [slug, setSlug] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const slug = getSlugFromSubdomain();
    setSlug(slug);

    if (!slug) {
      setError("Invalid app URL: missing slug.");
      setLoading(false);
      return;
    }

    // Dynamically load manifest or other assets
    fetch(`/app/${slug}/manifest.json`)
      .then((res) => {
        if (!res.ok) throw new Error("Manifest not found");
        return res.json();
      })
      .then((data) => {
        setManifest(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(`Failed to load app manifest: ${err.message}`);
        setLoading(false);
      });
    // You can also load other assets here (onnx, js, etc)
  }, []);

  if (loading) return <div>Loading app...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!manifest) return <div>No manifest found for this app.</div>;

  return (
    <div>
      <h1>{manifest.name || slug}</h1>
      {/* Render your app UI here */}
      {/* You can also load and render other assets as needed */}
    </div>
  );
};

export default App;