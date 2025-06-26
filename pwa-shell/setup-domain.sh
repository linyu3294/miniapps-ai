#!/bin/bash

# Setup domain for PWA Shell

set -e

echo "🌐 Setting up domain for PWA Shell..."
echo

# Check AWS CLI
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS CLI not configured. Run 'aws configure' first."
    exit 1
fi

echo "Choose an option:"
echo "1. Create new hosted zone"
echo "2. Use existing hosted zone"
echo "3. Exit"
echo

read -p "Enter choice (1-3): " choice

case $choice in
    1)
        read -p "Enter domain name (e.g., example.com): " domain_name
        if [ -z "$domain_name" ]; then
            echo "❌ Domain name cannot be empty"
            exit 1
        fi
        
        echo "📋 Creating hosted zone for $domain_name..."
        HOSTED_ZONE_RESPONSE=$(aws route53 create-hosted-zone \
            --name "$domain_name" \
            --caller-reference "$(date +%s)" \
            --output json)
        
        HOSTED_ZONE_ID=$(echo "$HOSTED_ZONE_RESPONSE" | jq -r '.HostedZone.Id' | sed 's/\/hostedzone\///')
        NAMESERVERS=$(echo "$HOSTED_ZONE_RESPONSE" | jq -r '.DelegationSet.NameServers[]')
        
        echo "✅ Hosted zone created!"
        echo "   Domain: $domain_name"
        echo "   Zone ID: $HOSTED_ZONE_ID"
        echo
        echo "🌐 Nameservers (update in your domain registrar):"
        for ns in $NAMESERVERS; do
            echo "   - $ns"
        done
        
        # Update terraform.tfvars
        cat > ../terraform.tfvars << EOF
region             = "us-east-1"
project_name       = "miniapps-ai"
environment        = "prod"
route53_zone_id    = "$HOSTED_ZONE_ID"
root_domain        = "$domain_name"
EOF
        
        echo
        echo "✅ Terraform configuration updated!"
        ;;
        
    2)
        read -p "Enter hosted zone ID: " zone_id
        if [ -z "$zone_id" ]; then
            echo "❌ Zone ID cannot be empty"
            exit 1
        fi
        
        echo "📋 Getting hosted zone details..."
        ZONE_DETAILS=$(aws route53 get-hosted-zone --id "$zone_id" --output json)
        ZONE_NAME=$(echo "$ZONE_DETAILS" | jq -r '.HostedZone.Name' | sed 's/\.$//')
        NAMESERVERS=$(echo "$ZONE_DETAILS" | jq -r '.DelegationSet.NameServers[]')
        
        echo "✅ Hosted zone details:"
        echo "   Domain: $ZONE_NAME"
        echo "   Zone ID: $zone_id"
        echo
        echo "🌐 Nameservers:"
        for ns in $NAMESERVERS; do
            echo "   - $ns"
        done
        
        # Update terraform.tfvars
        cat > ../terraform.tfvars << EOF
region             = "us-east-1"
project_name       = "miniapps-ai"
environment        = "prod"
route53_zone_id    = "$zone_id"
root_domain        = "$ZONE_NAME"
EOF
        
        echo
        echo "✅ Terraform configuration updated!"
        ;;
        
    3)
        echo "👋 Exiting..."
        exit 0
        ;;
        
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo
echo "📝 Next steps:"
echo "1. Update your domain registrar's nameservers"
echo "2. Wait 24-48 hours for DNS propagation"
echo "3. Run './deploy.sh' to deploy PWA Shell"
echo

echo "🔗 Your PWA Shell will be available at: https://{slug}.$domain_name (replace {slug} with your app's slug)" 