# PWA Shell App

A dynamic Progressive Web App shell that loads and runs apps from the MiniApps platform.

## 🚀 Features

- **Dynamic App Loading**: Loads app assets (UI, models) based on URL slug
- **Offline Support**: Service worker for caching and offline functionality
- **PWA Ready**: Installable on supported devices
- **React + Vite**: Modern development stack

## 🔧 Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🌐 Routing

The app responds to routes in the format:
```
/app/:slug/
```

For example:
- `/app/shape/` - Loads the Shape Detection app
- `/app/plant/` - Loads the Plant Recognition app

## 💻 Usage

1. Navigate to an app URL (e.g., `app.example.com/app/shape/`)
2. Shell app loads and fetches app manifest
3. App assets are downloaded and cached
4. App runs in the shell environment 