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

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.
