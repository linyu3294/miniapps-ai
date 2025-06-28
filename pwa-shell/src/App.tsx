import React, { useEffect, useState } from "react";

interface AppContent {
  html: string;
  js: string;
  serviceWorker: string;
  slug: string;
}

interface Manifest {
  [key: string]: any;
}

const App: React.FC = () => {
  const [slug, setSlugState] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [appContent, setAppContent] = useState<AppContent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [debugMsg, setDebugMsg] = useState<string>('');
  const [miniAppHtml, setMiniAppHtml] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    const loadResources = async () => {
      try {
        setDebugMsg('Starting mini program ...');
        const currentSlug = getSlugFromSubdomain();
        setSlugState(currentSlug);
        if (currentSlug) {
          const { html, js, serviceWorker } = await loadAppResources(currentSlug);
          setDebugMsg('All mini program resources loaded. Setting mini program content...');
          setAppContent({ html, js, serviceWorker, slug: currentSlug });
        } else {
          setError("Invalid mini program URL: missing slug.");
          setDebugMsg('No slug found in subdomain.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setDebugMsg('Error: ' + err);
      } finally {
        setLoading(false);
      }
    };
    loadResources();
  }, []);

  useEffect(() => {
    const injectMiniAppHtml = (content: AppContent): void => {
      setDebugMsg('Parsing and injecting mini program HTML...');
      const parser = new DOMParser();
      const doc = parser.parseFromString(content.html, 'text/html');
      doc.querySelectorAll('script[src]').forEach(script => script.remove());
      setMiniAppHtml(doc.body.innerHTML);
    };

    const injectMiniAppStyles = (content: AppContent): void => {
      setDebugMsg('Injecting mini program styles...');
      const parser = new DOMParser();
      const doc = parser.parseFromString(content.html, 'text/html');
      const styles = doc.querySelectorAll('style');
      styles.forEach(style => {
        if (!document.head.contains(style)) {
          document.head.appendChild(style.cloneNode(true));
        }
      });
    };

    const runInjection = async () => {
      if (!appContent) return;
      await ensureOrtLoaded();
      injectMiniAppHtml(appContent);
      injectMiniAppStyles(appContent);
      await registerMiniAppServiceWorkerForShell(appContent);
    };
    runInjection();
  }, [appContent]);

  useEffect(() => {
    if (miniAppHtml && appContent) {
      // Wait for React to render the HTML, then execute JS
      requestAnimationFrame(() => {
        setDebugMsg('Executing app JS...');
        executeMiniAppJs(appContent);
      });
    }
  }, [miniAppHtml, appContent]);

  const getSlugFromSubdomain = (): string | null => {
    try {
      const parts = window.location.hostname.split("."); 
      if (parts.length < 3) {
        return null;
      }
      const slug = parts[0];
      return slug;
    } catch (error) {
      console.error('Error getting slug from subdomain:', error);
      return null;
    }
  }

  const loadResource = async (resourceName: string, url: string): Promise<Response> => {
    setDebugMsg('Loading mini program resource: ' + `${resourceName}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to load mini program resource: ${resourceName}: ${response.statusText}`);
      throw new Error(`Failed to load mini program resource: ${resourceName}: ${response.statusText}`);
    }
    return response;
  }

  const loadAppResources = async (slug: string): Promise<AppContent> => {
      const manifestResponse = await loadResource('manifest.json', `/app/${slug}/manifest.json`);
      const manifest = await manifestResponse.json();
      setDebugMsg('Mini app manifest loaded. Fetching index.html...');
      setManifest(manifest);

      const htmlResponse = await loadResource('index.html', `/app/${slug}/index.html`);
      const htmlContent = await htmlResponse.text();
      setDebugMsg('Mini app index.html loaded. Fetching app.js...');

      const jsResponse = await loadResource('app.js', `/app/${slug}/app.js`);
      const jsContent = await jsResponse.text();
      setDebugMsg('Mini app app.js loaded. Fetching sw.js...');

      const serviceWorker = await loadResource('sw.js', `/app/${slug}/sw.js`);
      const swContent = await serviceWorker.text();
      setDebugMsg('Mini app sw.js (service worker) loaded. Pre-fetching model.onnx...');

      return {
        html: htmlContent,
        js: jsContent,
        serviceWorker: swContent,
        slug: slug
      } as AppContent;
  };

  const ensureOrtLoaded = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if ((window as any).ort) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load ONNX Runtime'));
      document.head.appendChild(script);
    });
  };

  const registerMiniAppServiceWorkerForShell = async (content: AppContent) => {
    setDebugMsg('Registering mini program service worker...');
    if ('serviceWorker' in navigator && content.serviceWorker) {
      // Register the service worker with the correct Shell URL scope
      const miniAppServiceWorkerUrl = `/app/${content.slug}/sw.js`;
      const shellDomainScope = '/';
      await navigator.serviceWorker.register(
        miniAppServiceWorkerUrl, {
          scope: shellDomainScope
        });
    }
  }

  const executeMiniAppJs = async (content: AppContent) => {
    setDebugMsg('Executing mini program JS...');
    const appScript = document.createElement('script');
    const updatedJsContent = content.js.replace(
      /'model\.onnx'/g, 
      `'/app/${content.slug}/model.onnx'`
    );
    appScript.textContent = updatedJsContent;
    document.body.appendChild(appScript);
  }

  if (loading) return <div>Loading app...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;

  return (
    <div>
      <div 
        style={{
          background:'#ffeeba',
          color:'#856404',
          padding:'8px',
          margin:'8px 0',
          borderRadius:'4px',
          fontSize:'14px'
      }}>
        <b>DEBUG:</b> {debugMsg}
      </div>
      <div
        id="app-container"
        dangerouslySetInnerHTML={{ __html: miniAppHtml }}
      />
    </div>
  );
};

export default App; 