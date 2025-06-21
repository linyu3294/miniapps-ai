output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.apps.bucket
}

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.s3_distribution.id
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.s3_distribution.domain_name
}

output "api_gateway_url" {
  description = "URL of the API Gateway endpoint"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "app_domain_url" {
  description = "URL of the PWA Shell"
  value       = "https://${var.apps_domain}"
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "cognito_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  value = aws_cognito_user_pool_client.client.id
}

output "cognito_endpoint" {
  value = aws_cognito_user_pool.main.endpoint
} 

