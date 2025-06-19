# MiniApps AI Platform

A platform for publishing and running AI-powered Progressive Web Apps (PWAs).

## 🏗️ Architecture

The platform consists of three main components:

### 1. Platform App (React)
- Main interface for publishers and subscribers
- App marketplace and management
- User authentication and roles
- Upload and manage AI apps

### 2. PWA Shell App (React + Vite)
- Dynamic PWA loader
- Runs apps from the platform
- Offline support
- Asset caching

### 3. Server Infrastructure (AWS)
- API Gateway for requests
- Lambda functions for processing
- S3 for app storage
- CloudFront for content delivery
- Route 53 for DNS management

## 📁 Project Structure
```
miniapps-ai/
├── server/           # AWS infrastructure and Lambda functions
├── pwa-shell/        # Dynamic PWA shell app
└── platform/         # Main platform web app (TODO)
```

## 📝 Documentation

- [Server Infrastructure](server/README.md)
- [PWA Shell App](pwa-shell/README.md)
- Platform App (Coming soon) 