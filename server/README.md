# Server Infrastructure

This directory contains the AWS infrastructure code (Terraform) and Lambda functions for the MiniApps platform.

## 🏗️ Infrastructure (Terraform)

The infrastructure is defined in `main.tf` and includes:

- **API Gateway (HTTP API V2)**: Handles API requests for app management
- **Lambda Functions**: Process API requests (subscriber API)
- **S3 Bucket**: Stores app assets (manifests, models, UI files)
- **CloudFront**: CDN for serving app assets
- **Route 53**: DNS management for the app domain

### 📝 Variables
Required variables in `terraform.tfvars`:
- `route53_zone_id`: Your Route 53 hosted zone ID
- `root_domain`: Your root domain (e.g., miniprograms.app)

> **Note:** The platform uses wildcard subdomains for each app: `{slug}.miniprograms.app` (e.g., `shape.miniprograms.app`).

### 🚀 Deployment
```bash
# Initialize Terraform
terraform init

# Plan changes
terraform plan

# Apply changes
terraform apply
```

## 🔨 Build and Deploy Process

### Lambda Functions
The `build.sh` script will run golang tests if there are any.
It will then compile Go Lambda functions and deploys necessary AWS infrastructure:

```bash
cd server
sh build.sh
```

### Testing
Run Go tests with:
```bash
cd server
go test ./...
```

## 📁 Directory Structure
```
server/
├── main.tf           # Main Terraform configuration
├── variables.tf      # Terraform variables
├── publisher.go      # Lambda function code
├── build.sh         # Build script for Lambda
└── go.mod           # Go module file
``` 