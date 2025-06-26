# PWA Shell Deployment Guide

## 🎯 Goal
Deploy the PWA Shell to AWS with a custom domain and wildcard subdomains for each app.

## 📋 Prerequisites
- AWS CLI configured
- Terraform installed
- Node.js and npm installed
- A domain name (purchased on NameCheap or similar)

## 🚀 Quick Setup (3 Steps)

### Step 1: Setup Domain
```bash
chmod +x setup-domain.sh
./setup-domain.sh
```
- Choose option 1 to create new hosted zone
- Enter your domain name (e.g., `yourdomain.com`)
- Copy the nameservers and update them in your domain registrar

### Step 2: Deploy PWA Shell
```bash
chmod +x deploy.sh
./deploy.sh
```
- This will deploy infrastructure and upload the PWA Shell
- Confirm the Terraform plan when prompted

### Step 3: Test
Visit: `https://shape.yourdomain.com` (replace 'shape' with your app slug)

## 🏗️ Architecture

```
PWA Shell ({slug}.yourdomain.com)
├── index.html          ← PWA Shell (deployed by you)
├── assets/             ← PWA Shell assets (deployed by you)
└── apps/shape/         ← Shape app (uploaded by publisher via Platform)
    ├── manifest.json
    ├── model.onnx
    └── ui.js
```

## 🔄 How It Works

1. **User visits**: `https://shape.yourdomain.com`
2. **CloudFront serves**: `index.html` (PWA Shell) from S3
3. **PWA Shell loads**: React app extracts the slug from the subdomain
4. **PWA Shell fetches**: App assets from `/apps/shape/` in S3
5. **App runs**: Within PWA Shell environment

## 📁 Files

- `deploy.sh` - Deploy PWA Shell to AWS
- `setup-domain.sh` - Setup domain and Route 53
- `DEPLOYMENT.md` - This guide
- `package.json` - PWA Shell dependencies
- `src/` - PWA Shell source code

## 🔧 Configuration

The `../terraform.tfvars` file contains:
```hcl
region             = "us-east-1"
project_name       = "miniapps-ai"
environment        = "prod"
route53_zone_id    = "Z1234567890ABCDEF"  # Your hosted zone ID
root_domain        = "yourdomain.com"     # Your root domain
```

## 🐛 Troubleshooting

- **DNS not working**: Wait 24-48 hours for propagation
- **CloudFront cache**: Run `./deploy.sh` to invalidate
- **S3 permissions**: Check bucket policy allows CloudFront access

## 📞 Support

- Check Terraform outputs: `cd .. && terraform output`
- Check S3 contents: `aws s3 ls s3://miniapps-ai-apps-prod/`
- Check CloudFront: `aws cloudfront list-distributions` 