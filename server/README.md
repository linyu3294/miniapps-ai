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

### CloudFront
- **Multi-origin**: Serves both PWA shell and app assets
- **URL Rewriting**: Routes `/app/{slug}/` to shell or assets
- **Caching**: 1-5 min TTL (dev), optimized (prod)



---

**For PWA Shell documentation:** [pwa-shell/README.md](../pwa-shell/README.md) 