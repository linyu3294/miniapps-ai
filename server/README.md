# Server Infrastructure

> **AWS serverless backend for the MiniApps platform - handles app publishing, storage, and delivery**

## 🏗️ Architecture Overview

The server infrastructure provides a complete serverless backend using AWS services:

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

## 🔧 Quick Start

### Prerequisites
```bash
# Required tools
aws --version     # AWS CLI configured
terraform --version  # v1.0+
go version        # Go 1.21+
```

### Configuration
1. **Create `terraform.tfvars`:**
```hcl
region           = "us-east-1"
root_domain      = "yourdomain.com"
route53_zone_id  = "Z1234567890ABC"
client_domain    = "https://www.yourdomain.com"
```

2. **Deploy Infrastructure:**
```bash
cd server
./build.sh      # Build Lambda functions
cd ..
terraform init
terraform apply
```

## 🚀 Build & Deploy Process

### Server Build (`server/build.sh`)
```bash
# Builds all Lambda functions
cd server && ./build.sh
```

**What it does:**
- Compiles Go functions for Linux AMD64
- Creates deployment ZIP files
- Handles Go module initialization

### Complete Deployment (`pwa-shell/deploy.sh`)
```bash
cd pwa-shell && ./deploy.sh
```

**Full deployment sequence:**
1. **Build Lambda functions** (`server/build.sh`)
2. **Deploy infrastructure** (Terraform plan + apply)
3. **Build PWA shell** (React production build)
4. **Upload to S3** (PWA shell assets)
5. **Invalidate CloudFront** (Clear CDN cache)

## 📡 API Endpoints

### Publisher API
```
POST /publish/{app-slug}/version/{version-id}
Authorization: Bearer <cognito-jwt>
Content-Type: application/json
```

**Request Body:**
```json
{
  "manifest": {
    "name": "Shape Classifier",
    "short_name": "ShapeAI",
    "start_url": "index.html",
    "display": "standalone",
    "icons": [{"src": "icon-192.png", "sizes": "192x192"}]
  },
  "files": [
    {"filename": "manifest.json", "size": 412, "type": "application/json"},
    {"filename": "model.onnx", "size": 23455678, "type": "application/octet-stream"},
    {"filename": "app.js", "size": 2859, "type": "application/javascript"}
  ],
  "entrypoint": "index.html",
  "version_notes": "Added multi-shape support"
}
```

**Response:**
```json
{
  "message": "Validation successful",
  "presigned_url": "https://s3.amazonaws.com/bucket/uploads/..."
}
```

### App Access URLs
```
https://app.yourdomain.com/app/{slug}/
```

## 🛠️ Infrastructure Details

### S3 Storage Strategy
```hcl
# Two-bucket architecture
apps_bucket/
├── uploads/{slug}/{version}/        # Temporary upload location
└── app/{slug}/                      # Processed app assets

pwa_shell_bucket/
├── index.html                       # React shell
├── assets/                          # JS/CSS bundles
└── manifest.json                    # PWA manifest
```

### CloudFront Distribution
**Multi-origin setup with intelligent routing:**

```javascript
// cloudfront-function/rewrite-url.js
function handler(event) {
    var request = event.request;
    if (request.uri.startsWith('/app/') && 
        !request.uri.match(/\.[a-zA-Z0-9]+$/)) {
        request.uri = '/index.html';  // Route to PWA shell
    }
    return request;
}
```

**Cache policies:**
- **Development**: 1-5 minutes TTL
- **Production**: AWS Managed-CachingOptimized
- **Special handling**: Service workers, ONNX models

### Lambda Functions

#### Publisher (`lambda/publisher/publisher.go`)
**Responsibilities:**
- Validate app metadata and files
- Check user authorization (Cognito groups)
- Generate S3 presigned upload URLs
- Enforce file size limits (<25MB for models)

#### Unzip (`lambda/unzip/unzip.go`)
**Responsibilities:**
- Triggered by S3 upload events
- Extract ZIP files to final app location
- Set proper MIME types
- Clean up temporary uploads

### Authentication & Authorization
```hcl
# Cognito User Pool with groups
resource "aws_cognito_user_pool_client" "client"
resource "aws_cognito_user_group" "publisher"

# API Gateway JWT authorizer
resource "aws_apigatewayv2_authorizer" "cognito"
```

**User Groups:**
- **Publishers**: Can upload apps
- **Subscribers**: Read-only access (future)

## 🔍 Configuration Variables

### Required (`terraform.tfvars`)
```hcl
root_domain      = "miniprograms.app"      # Your domain
route53_zone_id  = "Z1234567890ABC"        # Route 53 zone ID
client_domain    = "https://www.domain.com" # CORS origin
```

### Optional (`variables.tf`)
```hcl
region           = "us-east-1"             # AWS region
project_name     = "miniapps-ai"           # Resource prefix
environment      = "prod"                  # Environment tag
```

## 📤 Deployment Outputs

After successful deployment:
```bash
# Get important URLs
terraform output api_gateway_url          # API endpoint
terraform output cloudfront_domain_name   # CDN domain
terraform output cognito_pool_id          # User pool ID
```

**Example URLs:**
- **API**: `https://abc123.execute-api.us-east-1.amazonaws.com/v1`
- **Apps**: `https://shape.yourdomain.com`
- **CDN**: `https://d123456.cloudfront.net`

## 🚧 Development Workflow

### Local Testing
```bash
# Test Lambda functions locally
cd server/lambda/publisher
go test ./...

# Validate Terraform
terraform validate
terraform plan
```

### Deployment
```bash
# Use different tfvars for staging
terraform apply -var-file="staging.tfvars"
```

### Production Deployment
```bash
# Full deployment with confirmation
cd pwa-shell && ./deploy.sh
```

## 🔧 Troubleshooting

### Common Issues

| Issue | Symptoms | Solution |
|-------|----------|----------|
| **Upload fails** | 403 errors | Check Cognito user in Publisher group |
| **App won't load** | 404 errors | Verify S3 bucket permissions |
| **DNS issues** | Domain unreachable | Check Route 53 nameservers |
| **Build fails** | Go compile errors | Ensure Go 1.21+, run `go mod tidy` |

### Debug Commands
```bash
# Check Lambda logs
aws logs tail /aws/lambda/miniapps-ai-prod-publisher

# Test S3 permissions
aws s3 ls s3://miniapps-apps-prod/

# Verify CloudFront cache
aws cloudfront get-distribution --id E1234567890
```

**For PWA Shell documentation, see [pwa-shell/README.md](../pwa-shell/README.md)** 