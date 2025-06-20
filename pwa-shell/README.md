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

## 📋 Set up Complete Process

### **Step 1: Purchase Domain (Manual)**

1. Go to NameCheap
2. Search for and purchase your desired domain (e.g., yourdomain.com)
3. **Don't configure anything in NameCheap yet**

### **Step 2: Run setup-domain.sh**

```jsx
cd pwa-shell
chmod +x setup-domain.sh
./setup-domain.sh
```

- Choose option 1: "Create new hosted zone"
- Enter your purchased domain name
- The script will show you AWS nameservers

### **Step 3: Update NameCheap (Manual)**

1. Go back to NameCheap
2. Go to your domain's DNS settings
3. Change nameservers from NameCheap's to AWS nameservers (shown by the script)
4. Wait 24-48 hours for DNS propagation

### **Step 4: Deploy**

./deploy.sh

## **🔍 Why This Two-Step Process?**

- **NameCheap**: Sells you the domain name
- **AWS Route 53**: Manages DNS for your domain
- **setup-domain.sh**: Connects your NameCheap domain to AWS Route 53

The script is just a helper to set up the AWS side of things. You still need to purchase the domain manually from a registrar like NameCheap.


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
