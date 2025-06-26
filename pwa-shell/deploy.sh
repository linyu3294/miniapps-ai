#!/bin/bash

# Deploy PWA Shell to AWS

set -e

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/.."

echo "🚀 Deploying PWA Shell..."

# Check prerequisites
echo "📋 Checking prerequisites..."
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not found"; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "❌ Terraform not found"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm not found"; exit 1; }

# Build server assets (Lambda functions)
echo "📦 Building server assets..."
(cd "$PROJECT_ROOT/server" && ./build.sh)

# Deploy infrastructure
echo "🏗️  Deploying infrastructure..."
cd "$PROJECT_ROOT"

if [ ! -d ".terraform" ]; then
    echo "📦 Initializing Terraform..."
    terraform init
fi

echo "📋 Planning deployment..."
terraform plan -out=tfplan

read -p "Apply changes? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "✅ Applying Terraform changes..."
    terraform apply -auto-approve tfplan
else
    echo "❌ Deployment cancelled"
    exit 1
fi

# Get API Gateway URL from Terraform outputs
API_URL=$(terraform output -raw api_gateway_url)

# Build PWA shell
echo "🔨 Building PWA shell..."
cd "$PROJECT_ROOT/pwa-shell"
npm install
VITE_API_URL=$API_URL npm run build

# Ensure service-worker.js is in the root of dist/
if [ -f "src/service-worker.js" ]; then
  echo "🛠️  Copying service-worker.js to dist/"
  cp src/service-worker.js dist/service-worker.js
fi
cd ..

# Deploy to S3
echo "📤 Deploying to S3..."
S3_BUCKET=$(terraform output -raw pwa_shell_s3_bucket_name)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)

echo "📁 Uploading PWA shell to S3 bucket: $S3_BUCKET"
aws s3 sync "$PROJECT_ROOT/pwa-shell/dist/" s3://$S3_BUCKET/ --delete

# Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"

# Show deployment info
echo "✅ PWA Shell deployment completed!"
echo
APP_URL=$(terraform output -raw app_domain_url)
CLOUDFRONT_DOMAIN=$(terraform output -raw cloudfront_domain_name)

echo "🌐 PWA Shell URL: $APP_URL"
echo "☁️  CloudFront Domain: $CLOUDFRONT_DOMAIN (for debugging)"
echo "🔗 API URL: $API_URL"
echo
echo "📝 Test URLs:"
echo "   - PWA Shell: $APP_URL"
echo "   - Shape app: $APP_URL/app/shape/"
echo "   - Plant app: $APP_URL/app/plant/"
echo
echo "⚠️  Note: DNS propagation may take 24-48 hours" 