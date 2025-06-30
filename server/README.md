# Server Infrastructure

> **AWS serverless backend for the MiniApps platform**

## Architecture

The server provides a complete serverless backend using AWS:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Publishers    │    │   API Gateway   │    │   Lambda        │
│   (Upload Apps) │───▶│   + Cognito     │───▶│   Functions     │
└─────────────────┘    │   Auth          │    │   (Go)          │
                       └─────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CloudFront    │    │   S3 Buckets    │    │   Route 53      │
│   (Global CDN)  │◀───│   (App Storage) │    │   (DNS)         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐
│   End Users     │
│   (Run Apps)    │
└─────────────────┘
```

### Core Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **API Gateway** | HTTP API for app publishing | AWS API Gateway V2 |
| **Lambda Functions** | Business logic (publish, unzip) | Go 1.21+ |
| **S3 Storage** | App assets and PWA shell | Two S3 buckets |
| **CloudFront** | Global CDN with URL rewriting | Multi-origin distribution |
| **Cognito** | Publisher authentication | User pools + JWT |
| **Route 53** | DNS management | Wildcard subdomains |

## Quick Start

### Prerequisites
```bash
aws --version        # AWS CLI configured
terraform --version  # v1.0+
go version          # Go 1.21+
```

### Setup
1. **Create `terraform.tfvars`:**
```hcl
root_domain      = "yourdomain.com"
route53_zone_id  = "Z1234567890ABC"
client_domain    = "https://www.yourdomain.com"
```

2. **Deploy:**
```bash
cd server && ./build.sh    # Build Lambda functions
```

## Infrastructure Details

### Multi-Origin CloudFront Distribution

The platform uses a **single CloudFront distribution** with **two S3 origins** to intelligently route requests:

```
CloudFront Distribution
├── Origin 1: PWA Shell Bucket
│   └── Serves: React app shell, routing logic
└── Origin 2: Apps Bucket  
    └── Serves: Individual mini-app assets
```

#### Origin Routing Strategy

**Default Behavior (PWA Shell Origin):**
```javascript
// Routes to PWA shell for app navigation
Request: https://app.domain.com/app/shape/
CloudFront Function: → /index.html (PWA shell)
Result: React app loads and handles routing
```

**Asset-Specific Behaviors (Apps Origin):**
```javascript
// Direct asset serving from apps bucket
/app/*.onnx    → apps-bucket/app/{slug}/model.onnx
/app/*.html    → apps-bucket/app/{slug}/index.html  
/app/*.js      → apps-bucket/app/{slug}/app.js
/app/*.json    → apps-bucket/app/{slug}/manifest.json
```

#### URL Rewriting Logic

**CloudFront Function** (`cloudfront-function/rewrite-url.js`):
```javascript
function handler(event) {
    var request = event.request;
    // Route app navigation to PWA shell
    if (request.uri.startsWith('/app/') && 
        !request.uri.match(/\.[a-zA-Z0-9]+$/)) {
        request.uri = '/index.html';  // PWA shell handles routing
    }
    return request;
}
```

**Request Flow Examples:**
```
GET /app/shape/           → PWA Shell → React router handles /app/shape/
GET /app/shape/model.onnx → Apps Bucket → Direct file serve
GET /app/shape/app.js     → Apps Bucket → Direct file serve
```

### S3 Storage

```
apps_bucket/
├── uploads/{slug}/{version}/    # Temporary uploads
└── app/{slug}/                  # Processed apps

pwa_shell_bucket/
├── index.html                   # React shell
└── assets/                      # JS/CSS bundles
```

### Lambda Functions
- **Publisher**: Validates uploads, generates presigned URLs
- **Unzip**: Processes uploaded ZIPs, extracts to final location
**For PWA Shell documentation:** [pwa-shell/README.md](../pwa-shell/README.md) 