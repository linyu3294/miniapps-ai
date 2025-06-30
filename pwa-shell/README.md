# PWA Shell App

> **Dynamic Progressive Web App bootstrapper that loads and executes mini-apps from the MiniApps platform**

The PWA Shell App is a lightweight React application that serves as the **runtime environment** for mini-apps in the MiniApps ecosystem. It dynamically loads app assets from S3 based on URL slugs and provides offline capabilities through sophisticated caching strategies.

## 🏗️ Architecture Role

The PWA Shell App is one of two main client applications in the MiniApps platform:

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Platform App      │    │   PWA Shell App     │    │   AWS Backend       │
│   (Netlify)        │    │   (CloudFront)      │    │   (API Gateway)     │
├─────────────────────┤    ├─────────────────────┤    ├─────────────────────┤
│ • Publisher Portal  │    │ • App Bootstrapper  │    │ • Lambda Functions  │
│ • Subscriber Portal │    │ • Dynamic Loader    │    │ • S3 Storage        │
│ • App Marketplace   │    │ • Offline Runner    │    │ • Cognito Auth      │
│ • Upload Interface  │    │ • ML Model Executor │    │ • DynamoDB          │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

**Key Responsibilities:**
- **Dynamic Loading**: Fetches app assets based on URL slug patterns
- **Runtime Environment**: Provides execution context for mini-apps
- **Offline Support**: Caches models and assets for offline functionality
- **ML Execution**: Enables local inference using ONNX.js, TensorFlow.js
- **PWA Features**: Installable, works offline, home screen integration

## 🚀 Features

### 🔄 Dynamic App Loading
- Loads app assets (HTML, JS, CSS, ML models) based on URL slug
- Supports multiple ML frameworks (ONNX.js, TensorFlow.js, WebAssembly)
- Hot-swappable app loading without shell redeployment

### 📱 Progressive Web App
- **Installable**: Can be installed to device home screen
- **Offline-First**: Service worker enables offline functionality
- **Responsive**: Works across mobile, tablet, and desktop
- **Fast**: Cached assets provide instant loading

### 🧠 ML Model Support
- **Local Inference**: Run models entirely in browser
- **Model Caching**: Intelligent caching of large model files
- **Multiple Formats**: Support for ONNX, TensorFlow.js, custom formats
- **Performance**: Optimized loading and execution

### 🌐 Multi-Layer Caching
- **CloudFront CDN**: Global edge caching (1-5 mins in dev)
- **Service Worker**: Browser-level asset caching
- **App-Level**: Custom caching strategies per mini-app

## 🔧 Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Access to AWS resources (for production deployment)

### Local Development
```bash
# Clone and install dependencies
git clone <repository>
cd pwa-shell
npm install

# Start development server
npm run dev

# The app will be available at http://localhost:5173
```

### Environment Configuration
Create `.env.local` file:
```env
VITE_API_BASE_URL=https://your-api-domain.com
VITE_APPS_CDN_URL=https://your-cloudfront-domain.com
```

### Testing Mini-Apps Locally
```bash
# Serve sample apps for testing
cd pwa-shell
npm run serve-sample-apps

# Navigate to: http://localhost:5173/app/sample-shape/
```

## 🌐 URL Routing & App Loading

### URL Pattern
```
https://app.yourdomain.com/app/{slug}/
```

**Examples:**
- `https://app.miniprograms.app/app/shape/` → Shape Detection app
- `https://app.miniprograms.app/app/plant/` → Plant Recognition app
- `https://app.miniprograms.app/app/sentiment/` → Sentiment Analysis app

### Loading Sequence
1. **URL Parse**: Extract app slug from URL path
2. **Manifest Fetch**: Request `manifest.json` from S3
3. **Asset Download**: Fetch required assets (HTML, JS, models)
4. **Cache Strategy**: Store assets based on caching policy
5. **App Bootstrap**: Initialize and render the mini-app
6. **ML Setup**: Load and initialize ML models if present

## 📦 Deployment

### 🔧 Domain Setup Process

#### Step 1: Purchase Domain (Manual)
1. Purchase domain from registrar (NameCheap, GoDaddy, etc.)
2. **Don't configure DNS settings yet**

#### Step 2: AWS Route 53 Setup
```bash
cd pwa-shell
chmod +x setup-domain.sh
./setup-domain.sh
```

**Script Options:**
- **Option 1**: Create new hosted zone (new domain)
- **Option 2**: Use existing hosted zone (existing domain)

**The script will:**
- Create Route 53 hosted zone
- Configure DNS records for app subdomains
- Display nameservers for your registrar

#### Step 3: Update Registrar DNS
1. Login to your domain registrar
2. Navigate to DNS/Nameserver settings
3. Replace default nameservers with AWS nameservers (from script output)
4. **Wait 24-48 hours** for DNS propagation

#### Step 4: Deploy to AWS
```bash
./deploy.sh
```

**Deploy script will:**
- Build React app for production
- Upload assets to S3
- Configure CloudFront distribution
- Set up SSL certificates
- Configure domain routing

### 🚀 Production Configuration

#### CloudFront Cache Policies
```javascript
// Development: Short cache for rapid iteration
default_ttl = 60     // 1 minute
max_ttl     = 300    // 5 minutes

// Production: Optimized caching
// Uses AWS Managed-CachingOptimized policy
```

#### Service Worker Caching
```javascript
// App Shell (Always cache)
- index.html
- main.js, main.css
- manifest.json

// Mini-App Assets (Cache per app)
- {slug}/index.html
- {slug}/app.js
- {slug}/model.onnx
- {slug}/assets/*

// Dynamic Content (Network first)
- API calls
- User data
```

## 🛠️ Technical Architecture

### Core Components

#### App Loader (`src/AppLoader.tsx`)
```typescript
interface AppLoaderProps {
  slug: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

// Handles dynamic loading and execution of mini-apps
```

#### Manifest Parser (`src/ManifestParser.ts`)
```typescript
interface AppManifest {
  name: string;
  version: string;
  entrypoint: string;
  assets: AssetDefinition[];
  model?: ModelDefinition;
  permissions?: string[];
}
```

#### Cache Manager (`src/CacheManager.ts`)
```typescript
class CacheManager {
  // Multi-layer caching strategy
  async cacheAsset(url: string, policy: CachePolicy): Promise<void>
  async getCachedAsset(url: string): Promise<Response | null>
  async invalidateCache(pattern: string): Promise<void>
}
```

### Error Handling
- **Network Errors**: Graceful fallback to cached versions
- **Manifest Errors**: User-friendly error messages
- **Model Loading**: Progressive loading with user feedback
- **App Crashes**: Isolated error boundaries per mini-app

### Performance Optimizations
- **Code Splitting**: Lazy load mini-app assets
- **Model Streaming**: Progressive model loading
- **Asset Preloading**: Predictive asset fetching
- **Memory Management**: Cleanup when switching apps

## 🔍 Debugging & Monitoring

### Development Tools
```bash
# Enable debug mode
VITE_DEBUG=true npm run dev

# Monitor cache performance
# Open DevTools → Application → Cache Storage

# View service worker logs
# Open DevTools → Application → Service Workers
```

### Performance Monitoring
```javascript
// Built-in performance metrics
window.miniAppsMetrics = {
  loadTime: number,
  cacheHitRatio: number,
  modelLoadTime: number,
  appInitTime: number
}
```

### Common Issues & Solutions

| Issue | Symptoms | Solution |
|-------|----------|----------|
| App won't load | Blank screen, network errors | Check S3 bucket permissions, CloudFront cache |
| Model loading fails | ML features disabled | Verify model file size (<25MB), format compatibility |
| Offline mode broken | App fails without internet | Check service worker registration, cache policies |
| Slow loading | Poor performance | Review CloudFront cache settings, optimize assets |

## 📚 Mini-App Development Guide

### Required Files Structure
```
your-mini-app.zip
├── manifest.json      # App metadata and configuration
├── index.html         # Entry point HTML
├── app.js            # Main application logic
├── model.onnx        # ML model (optional, <25MB)
├── service-worker.js  # Offline support (optional)
├── icons/            # App icons for installation
│   ├── icon-192.png
│   └── icon-512.png
└── assets/           # Additional assets
    ├── styles.css
    └── images/
```

### Sample Manifest
```json
{
  "name": "Shape Classifier",
  "short_name": "ShapeAI",
  "version": "1.0.0",
  "start_url": "index.html",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#ffffff",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ],
  "ml_model": {
    "file": "model.onnx",
    "framework": "onnx",
    "input_shape": [1, 3, 224, 224]
  }
}
```

### Integration with Shell
```javascript
// Your app.js should expose these methods
window.miniApp = {
  // Called when app loads
  init: async function(shellAPI) {
    // Initialize your app
  },
  
  // Called when app is closed/navigated away
  cleanup: function() {
    // Clean up resources
  },
  
  // Optional: Handle shell events
  onShellEvent: function(eventType, data) {
    // Respond to shell events
  }
};
```

## 🚧 Roadmap

### Current Version (v1.0)
- ✅ Dynamic app loading
- ✅ Basic caching strategy
- ✅ ML model support
- ✅ PWA features

### Next Version (v1.1)
- [ ] App versioning support
- [ ] Enhanced error recovery
- [ ] Performance analytics
- [ ] User preferences sync

### Future Features
- [ ] Real-time app updates
- [ ] Background sync
- [ ] Push notifications
- [ ] Advanced security policies

## 🤝 Contributing

See the main repository [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
