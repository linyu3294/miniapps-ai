#!/bin/bash

# Deploy PWA Shell to AWS

set -e

echo "🚀 Deploying PWA Shell..."

# Check prerequisites
echo "📋 Checking prerequisites..."
command -v aws >/dev/null 2>&1 || { echo "❌ AWS CLI not found"; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo "❌ Terraform not found"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm not found"; exit 1; }

# Deploy infrastructure
echo "🏗️  Deploying infrastructure..."
cd ../server

if [ ! -d ".terraform" ]; then
    echo "📦 Initializing Terraform..."
    terraform init
fi

echo "📋 Planning deployment..."
terraform plan

read -p "Apply changes? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "✅ Applying Terraform changes..."
    terraform apply -auto-approve
else
    echo "❌ Deployment cancelled"
    exit 1
fi

cd ..

# Build PWA shell
echo "🔨 Building PWA shell..."
cd pwa-shell
npm install
npm run build
cd ..

# Deploy to S3
echo "📤 Deploying to S3..."
cd server
S3_BUCKET=$(terraform output -raw s3_bucket_name)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)
cd ..

echo "📁 Uploading PWA shell to S3 bucket: $S3_BUCKET"
aws s3 sync pwa-shell/dist/ s3://$S3_BUCKET/ --delete

# Invalidate CloudFront cache
echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*"

# Show deployment info
echo "✅ PWA Shell deployment completed!"
echo
cd server
APP_URL=$(terraform output -raw app_domain_url)
API_URL=$(terraform output -raw api_gateway_url)
cd ..

echo "🌐 PWA Shell URL: $APP_URL"
echo "🔗 API URL: $API_URL"
echo
echo "📝 Test URLs:"
echo "   - PWA Shell: $APP_URL"
echo "   - Shape app: $APP_URL/app/shape/"
echo "   - Plant app: $APP_URL/app/plant/"
echo
echo "⚠️  Note: DNS propagation may take 24-48 hours" 