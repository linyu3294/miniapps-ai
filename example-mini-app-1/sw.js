const CACHE_NAME = 'shape-classifier-v1';
const MODEL_CACHE_NAME = 'shape-classifier-model-v1';

const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon.png',
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache app resources
      caches.open(CACHE_NAME).then((cache) => {
        console.log('Opened app cache');
        const cachePromises = urlsToCache.map(url => {
          const cacheUrl = url.startsWith('http') ? url : self.location.origin + url;
          return cache.add(cacheUrl).catch(() => {});
        });
        return Promise.all(cachePromises);
      }),
      
      // Cache the model separately (it's large and needs special handling)
      caches.open(MODEL_CACHE_NAME).then((cache) => {
        console.log('Opened model cache');
        // Optionally pre-cache model.onnx if desired
        // return cache.add('/model.onnx').catch(() => {});
        return Promise.resolve();
      })
    ])
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Special handling for model.onnx with Range requests
  if (url.pathname.endsWith('model.onnx') && event.request.headers.has('range')) {
    event.respondWith(
      caches.open(MODEL_CACHE_NAME).then(async (cache) => {
        let response = await cache.match(event.request.url);
        if (!response) {
          response = await fetch(event.request);
          await cache.put(event.request.url, response.clone());
        }
        return response;
      })
    );
    return;
  }
  
  // Special handling for model.onnx (full fetch)
  if (url.pathname.endsWith('model.onnx')) {
    event.respondWith(
      caches.open(MODEL_CACHE_NAME)
        .then((cache) => {
          return cache.match(event.request)
            .then((response) => {
              if (response) {
                console.log('Serving model from cache');
                return response;
              }
              
              // If not in cache, fetch from network
              return fetch(event.request)
                .then((networkResponse) => {
                  if (networkResponse.ok) {
                    // Cache the model for future use
                    cache.put(event.request, networkResponse.clone());
                    console.log('Model cached for future use');
                  }
                  return networkResponse;
                });
            });
        })
    );
    return;
  }
  
  // Handle other resources
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        if (response) {
          return response;
        }
        
        // Clone the request because it's a stream
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest).then((response) => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response because it's a stream
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName !== MODEL_CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// Handle background sync for model updates
self.addEventListener('sync', (event) => {
  if (event.tag === 'model-update') {
    event.waitUntil(updateModel());
  }
});

async function updateModel() {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    // Use the correct model path
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