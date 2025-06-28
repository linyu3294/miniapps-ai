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

  useEffect(() => {
    const loadApp = async (): Promise<void> => {
      setDebugMsg('Starting mini program ...');
      setSlug();
      if (slug) {
        const { html, js, serviceWorker } = await loadAppResources(slug);
        setDebugMsg('All mini program resources loaded. Setting mini program content...');
        setAppContent({ html, js, serviceWorker, slug: slug });
      }
    };
    loadApp();
  }, []);

  useEffect(() => {
    if (appContent) {
      setDebugMsg('Injecting mini program content...');
      injectAppContent(appContent);
    }
  }, [appContent]);


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

  const setSlug = (): void => {
    const slug = getSlugFromSubdomain();
    setSlugState(slug);
    if (!slug) {
      setError("Invalid mini program URL: missing slug.");
      setDebugMsg('No slug found in subdomain.');
      setLoading(false);
    }
  }

  const loadAppResources = async (slug: string): Promise<AppContent> => {
    try {
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

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load app resources: ${errorMessage}`);
      setDebugMsg('Error: ' + errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
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

  const injectMiniAppHtml = (appContainer: HTMLElement, content: AppContent): void => {
    setDebugMsg('Parsing and injecting mini program HTML...');
    const parser = new DOMParser();
    const doc = parser.parseFromString(content.html, 'text/html');
    doc.querySelectorAll('script[src]').forEach(script => script.remove());
    appContainer.innerHTML = doc.body.innerHTML;
  }

  const injectMiniAppStyles = (doc: Document): void => {
    setDebugMsg('Injecting mini program styles...');
    const styles = doc.querySelectorAll('style');
    styles.forEach(style => {
      if (!document.head.contains(style)) {
        document.head.appendChild(style.cloneNode(true));
      }
    });
  }

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

  const injectAppContent = async (content: AppContent) => {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) {
      setDebugMsg('Unable to inject mini program content: app-container div not found!');
      return;
    }
    try {
      await ensureOrtLoaded()
      injectMiniAppHtml(appContainer, content);
      injectMiniAppStyles(document);
      registerMiniAppServiceWorkerForShell(content);
      executeMiniAppJs(content);
      setDebugMsg('Service worker registered. Executing app JS...');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setDebugMsg('Unable to inject mini program content: ' + errorMessage);
      console.error('Unable to inject mini program content: ', error);
    }
  };

  if (loading) return <div>Loading app...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!manifest) return <div>No manifest found for this app.</div>;

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
      <div id="app-container">
        <div>Loading app content...</div>
      </div>
    </div>
  );
};

export default App; 