const VERSION = '1.0.0';
const CACHE_NAME = `shape-classifier-app-${VERSION}`;
const MODEL_CACHE_NAME = `shape-classifier-model-${VERSION}`;
const STATIC_CACHE_NAME = `shape-classifier-static-${VERSION}`;
const CDN_CACHE_NAME = `shape-classifier-cdn-${VERSION}`;

// Development mode detection
const isDevelopment = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

// Asset categorization for different caching strategies
const ASSET_STRATEGIES = {
  // Never cache in development, cache-first in production
  'app-critical': {
    files: ['/app.js', '/index.html'],
    strategy: isDevelopment ? 'network-first' : 'stale-while-revalidate',
    maxAge: isDevelopment ? 0 : 3600 // 1 hour in production
  },
  // Always cache aggressively - rarely change
  'static': {
    files: ['/manifest.json', '/icon.png'],
    strategy: 'cache-first',
    maxAge: 86400 * 30 // 30 days
  },
  // Cache but validate frequently - external dependencies
  'cdn': {
    files: ['https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js'],
    strategy: 'stale-while-revalidate',
    maxAge: 86400 * 7 // 7 days
  },
  // Large files - special handling for range requests
  'model': {
    files: ['/model.onnx'],
    strategy: isDevelopment ? 'network-first' : 'cache-first',
    maxAge: isDevelopment ? 0 : 86400 * 7, // 7 days in production
    supportRangeRequests: true
  }
};

const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon.png',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js'
];

const getCacheForAsset = (url) => {
  if (url.includes('cdn.jsdelivr.net')) return CDN_CACHE_NAME;
  if (url.endsWith('model.onnx')) return MODEL_CACHE_NAME;
  if (url.endsWith('.png') || url.endsWith('manifest.json')) return STATIC_CACHE_NAME;
  return CACHE_NAME;
};

const getStrategyForAsset = (url) => {
  for (const [type, config] of Object.entries(ASSET_STRATEGIES)) {
    if (config.files.some(file => url.includes(file) || url.endsWith(file))) {
      return config;
    }
  }
  return ASSET_STRATEGIES['app-critical']; // default
};

const cacheAppResources = async () => {
  const cachePromises = urlsToCache.map(async (url) => {
    try {
      const cacheUrl = url.startsWith('http') ? url : self.location.origin + url;
      const cacheName = getCacheForAsset(cacheUrl);
      const cache = await caches.open(cacheName);
      
      await cache.add(cacheUrl);
      console.log(`Cached: ${cacheUrl} in ${cacheName}`);
    } catch (error) {
      console.warn(`Failed to cache ${url}:`, error);
    }
  });
  return Promise.all(cachePromises);
};

const cacheModel = async () => {
  // In development, don't pre-cache large models - load on demand
  if (!isDevelopment) {
    try {
      const cache = await caches.open(MODEL_CACHE_NAME);
      await cache.add('/model.onnx');
      console.log('Model pre-cached');
    } catch (error) {
      console.warn('Failed to pre-cache model:', error);
    }
  }
};

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    Promise.all([
      cacheAppResources(),
      cacheModel()
    ])
  );
  // Force activation in development
  if (isDevelopment) {
    self.skipWaiting();
  }
});

// Enhanced fetch handler with strategy-based routing
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const strategy = getStrategyForAsset(event.request.url);
  
  if (url.pathname.endsWith('model.onnx')) {
    event.respondWith(handleModelRequest(event.request, strategy));
  } else {
    event.respondWith(handleRequest(event.request, strategy));
  }
});

async function handleModelRequest(request, strategy) {
  const modelCache = await caches.open(MODEL_CACHE_NAME);
  
  // Handle range requests (never cache range responses)
  if (request.headers.has('range')) {
    console.log('Range request detected, fetching from network');
    return fetch(request);
  }
  // Strategy-based handling for full file requests
  switch (strategy.strategy) {
    case 'network-first':
      return networkFirst(request, modelCache);
    case 'cache-first':
      return cacheFirst(request, modelCache);
    case 'stale-while-revalidate':
      return staleWhileRevalidate(request, modelCache);
    default:
      return fetch(request);
  }
}

async function handleRequest(request, strategy) {
  const cacheName = getCacheForAsset(request.url);
  const cache = await caches.open(cacheName);
  
  switch (strategy.strategy) {
    case 'network-first':
      return networkFirst(request, cache);
    case 'cache-first':
      return cacheFirst(request, cache);
    case 'stale-while-revalidate':
      return staleWhileRevalidate(request, cache);
    default:
      return fetch(request);
  }
}

async function networkFirst(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone and cache the response
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Fall back to cache
    const cached = await cache.match(request);
    if (cached) {
      console.log('Network failed, serving from cache:', request.url);
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request, cache) {
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // For navigation requests, return offline fallback
    if (request.mode === 'navigate') {
      const offlineResponse = await cache.match('/index.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, cache) {
  const cached = await cache.match(request);
  
  // Always fetch in background to update cache
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(error => {
    console.warn('Background fetch failed:', error);
  });
  
  // Return cached version immediately if available
  if (cached) {
    // Don't await the background fetch
    fetchPromise;
    return cached;
  }
  
  // If no cached version, wait for network
  return fetchPromise;
}

const deleteOldCaches = async () => {
  const cacheNames = await caches.keys();
  const currentCaches = [CACHE_NAME, MODEL_CACHE_NAME, STATIC_CACHE_NAME, CDN_CACHE_NAME];
  
  return Promise.all(
    cacheNames.map((cacheName) => {
      if (!currentCaches.includes(cacheName)) {
        console.log('Deleting old cache:', cacheName);
        return caches.delete(cacheName);
      }
    })
  );
};

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    Promise.all([
      deleteOldCaches(),
      // Take control immediately in development
      isDevelopment ? self.clients.claim() : Promise.resolve()
    ])
  );
});

async function updateModel() {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const modelPath = self.location.pathname.includes('/app/') 
      ? self.location.pathname.replace(/\/[^\/]*$/, '/model.onnx')
      : '/model.onnx';
    const response = await fetch(modelPath);
    if (response.ok) {
      await cache.put(modelPath, response);
      console.log('Model updated successfully');
    }
  } catch (error) {
    console.error('Failed to update model:', error);
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'model-update') {
    event.waitUntil(updateModel());
  }
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Allow manual cache clearing in development
  if (event.data && event.data.type === 'CLEAR_CACHE' && isDevelopment) {
    event.waitUntil(
      caches.keys().then(cacheNames => 
        Promise.all(cacheNames.map(name => caches.delete(name)))
      ).then(() => {
        console.log('All caches cleared');
        // Notify the client
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'CACHE_CLEARED' });
          });
        });
      })
    );
  }
});
