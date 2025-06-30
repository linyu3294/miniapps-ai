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

## API

### Publisher Endpoint
```
POST /publish/{app-slug}/version/{version-id}
Authorization: Bearer <cognito-jwt>
```

**Request:**
```json
{
  "manifest": {...},
  "files": [
    {"filename": "model.onnx", "size": 23455678, "type": "application/octet-stream"}
  ],
  "entrypoint": "index.html"
}
```

**Response:**
```json
{
  "presigned_url": "https://s3.amazonaws.com/bucket/uploads/..."
}
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

## Deployment

### Full Deployment
```bash
cd pwa-shell && ./deploy.sh
```

**Process:**
1. Build Lambda functions
2. Deploy Terraform infrastructure  
3. Build React app
4. Upload to S3
5. Invalidate CloudFront cache

### Configuration
```bash
# Get deployment outputs
terraform output api_gateway_url
terraform output cloudfront_domain_name
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Upload fails (403) | Check Cognito user in Publisher group |
| App won't load (404) | Verify S3 bucket permissions |
| Build fails | Ensure Go 1.21+, run `go mod tidy` |
| DNS issues | Check Route 53 nameservers |

### Debug Commands
```bash
# Check Lambda logs
aws logs tail /aws/lambda/miniapps-ai-prod-publisher

# Test S3 access
aws s3 ls s3://miniapps-apps-prod/
```

---

**For PWA Shell documentation:** [pwa-shell/README.md](../pwa-shell/README.md) 