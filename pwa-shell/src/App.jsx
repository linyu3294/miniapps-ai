import React, { useEffect, useState } from "react";

function getSlugFromSubdomain() {
  try {
    const parts = window.location.hostname.split("."); 
    if (parts.length < 3) {
      return null;
    }
    const slug = parts[0];
    return slug;
  } catch (error) {
    console.error('Error getting slug from subdomain:', error);
  }
}

const loadResource = async (resourceName, url) => {
  setDebugMsg('Loading resource: ' + `${resourceName}`);
  const response = await fetch(url);
  if (!response.ok) {
    console.error(`Failed to load ${resourceName}: ${response.statusText}`);
    throw new Error(`Failed to load ${resourceName}: ${response.statusText}`);
  }
  return response;
}

const App = () => {
  const [slug, setSlugState] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [appContent, setAppContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [debugMsg, setDebugMsg] = useState('');

  const setSlug = () => {
    const slug = getSlugFromSubdomain();
    setSlugState(slug);
    if (!slug) {
      setError("Invalid app URL: missing slug.");
      setDebugMsg('No slug found in subdomain.');
      setLoading(false);
    }
  }

  useEffect(async () => {
    setDebugMsg('Starting app load...');
    setSlug();
    const { htmlContent, jsContent, swContent } = await loadAppResources(slug);
    setDebugMsg('All resources loaded. Setting app content...');
    setAppContent({
      html: htmlContent,
      js: jsContent,
      sw: swContent,
      slug: slug
    });
  }, []);

  const loadAppResources = async (slug) => {
    try {
      const manifestResponse = await loadResource('manifest.json', `/app/${slug}/manifest.json`);
      const manifest = manifestResponse.json();
      setDebugMsg('Manifest loaded. Fetching index.html...');
      setManifest(manifest);

      const htmlResponse = await loadResource('index.html', `/app/${slug}/index.html`);
      const htmlContent = htmlResponse.text();
      setDebugMsg('index.html loaded. Fetching app.js...');

      const jsResponse = await loadResource('app.js', `/app/${slug}/app.js`);
      const jsContent = jsResponse.text();
      setDebugMsg('app.js loaded. Fetching sw.js...');

      const serviceWorker = await loadResource('sw.js', `/app/${slug}/sw.js`);
      const swContent = serviceWorker.text();
      setDebugMsg('sw.js loaded. Pre-fetching model.onnx...');

      return {
        htmlContent,
        jsContent,
        swContent
      }
    } catch (err) {
      setError(`Failed to load app resources: ${err.message}`);
      setDebugMsg('Error: ' + err.message);
    } finally {
      setLoading(false);
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