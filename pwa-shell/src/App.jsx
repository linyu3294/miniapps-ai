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
  const [appContent, setAppContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugMsg, setDebugMsg] = useState('');

  useEffect(() => {
    setDebugMsg('Starting app load...');
    const slug = getSlugFromSubdomain();
    setSlug(slug);
    if (!slug) {
      setError("Invalid app URL: missing slug.");
      setLoading(false);
      setDebugMsg('No slug found in subdomain.');
      return;
    }
    setDebugMsg('Loading app resources for slug: ' + slug);
    loadAppResources(slug);
  }, []);

  const loadAppResources = async (slug) => {
    try {
      setDebugMsg('Fetching manifest.json...');
      const manifestResponse = await fetch(`/app/${slug}/manifest.json`);
      if (!manifestResponse.ok) throw new Error("Manifest not found");
      const manifest = await manifestResponse.json();
      setManifest(manifest);
      setDebugMsg('Manifest loaded. Fetching index.html...');
      const htmlResponse = await fetch(`/app/${slug}/index.html`);
      if (!htmlResponse.ok) throw new Error("App HTML not found");
      const htmlContent = await htmlResponse.text();
      setDebugMsg('index.html loaded. Fetching app.js...');
      const jsResponse = await fetch(`/app/${slug}/app.js`);
      if (!jsResponse.ok) throw new Error("App JavaScript not found");
      const jsContent = await jsResponse.text();
      setDebugMsg('app.js loaded. Fetching sw.js...');
      const swResponse = await fetch(`/app/${slug}/sw.js`);
      if (!swResponse.ok) throw new Error("Service worker not found");
      const swContent = await swResponse.text();
      setDebugMsg('sw.js loaded. Pre-fetching model.onnx...');
      setDebugMsg('All resources loaded. Setting app content...');
      setAppContent({
        html: htmlContent,
        js: jsContent,
        sw: swContent,
        slug: slug
      });
      setLoading(false);
    } catch (err) {
      setError(`Failed to load app resources: ${err.message}`);
      setLoading(false);
      setDebugMsg('Error: ' + err.message);
    }
  };

  useEffect(() => {
    if (appContent) {
      setDebugMsg('Injecting app content...');
      injectAppContent(appContent);
    }
  }, [appContent]);

  const ensureOrtLoaded = () => {
    return new Promise((resolve, reject) => {
      if (window.ort) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const injectAppContent = (content) => {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) {
      setDebugMsg('app-container div not found!');
      return;
    }
    setDebugMsg('Parsing and injecting HTML...');
    const parser = new DOMParser();
    const doc = parser.parseFromString(content.html, 'text/html');
    doc.querySelectorAll('script[src]').forEach(script => script.remove());
    appContainer.innerHTML = doc.body.innerHTML;
    setDebugMsg('Injected HTML. Injecting styles...');
    const styles = doc.querySelectorAll('style');
    styles.forEach(style => {
      if (!document.head.contains(style)) {
        document.head.appendChild(style.cloneNode(true));
      }
    });
    setDebugMsg('Ensuring ONNX Runtime (ort) is loaded...');
    ensureOrtLoaded().then(() => {
      setDebugMsg('ONNX Runtime loaded. Registering service worker...');
      if ('serviceWorker' in navigator && content.sw) {
        registerServiceWorker(content.sw, content.slug);
      }
      setDebugMsg('Service worker registered. Executing app JS...');
      try {
        const appScript = document.createElement('script');
        const updatedJsContent = content.js.replace(
          /'model\.onnx'/g, 
          `'/app/${content.slug}/model.onnx'`
        );
        appScript.textContent = updatedJsContent;
        document.body.appendChild(appScript);
        setDebugMsg('App JS executed. Calling window.startShapeApp if exists...');
        if (window.startShapeApp) {
          setDebugMsg('Waiting for #cameraBtn to exist before starting app...');
          const waitForBtn = () => {
            if (document.getElementById('cameraBtn')) {
              setDebugMsg('Found #cameraBtn, starting app...');
              window.startShapeApp();
            } else {
              setTimeout(waitForBtn, 50);
            }
          };
          waitForBtn();
        } else {
          setDebugMsg('window.startShapeApp not found!');
        }
      } catch (error) {
        setDebugMsg('Error executing app JavaScript: ' + error.message);
        console.error('Error executing app JavaScript:', error);
      }
    }).catch((err) => {
      setDebugMsg('Failed to load ONNX Runtime: ' + err);
      console.error('Failed to load ONNX Runtime:', err);
    });
  };

  const registerServiceWorker = async (swContent, slug) => {
    try {
      // Register the service worker with the correct scope and real URL
      const swUrl = `/app/${slug}/sw.js`;
      const registration = await navigator.serviceWorker.register(swUrl, {
        scope: '/'
      });
      
      console.log('Service worker registered for app:', slug, registration);
      
    } catch (error) {
      console.error('Failed to register service worker for app:', slug, error);
    }
  };

  if (loading) return <div>Loading app...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!manifest) return <div>No manifest found for this app.</div>;

  return (
    <div>
      <div style={{background:'#ffeeba',color:'#856404',padding:'8px',margin:'8px 0',borderRadius:'4px',fontSize:'14px'}}>
        <b>DEBUG:</b> {debugMsg}
      </div>
      <div id="app-container">
        {/* App content will be injected here */}
        <div>Loading app content...</div>
      </div>
    </div>
  );
};

export default App;