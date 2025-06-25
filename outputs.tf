output "s3_bucket_name" {
  description = "Name of the S3 bucket for mini-app assets"
  value       = aws_s3_bucket.apps.bucket
}

output "pwa_shell_s3_bucket_name" {
  description = "Name of the S3 bucket for the PWA shell"
  value       = aws_s3_bucket.pwa_shell_bucket.bucket
}

output "cloudfront_distribution_id" {
  description = "ID of the main CloudFront distribution"
  value       = aws_cloudfront_distribution.main_distribution.id
}

output "cloudfront_domain_name" {
  description = "Domain name of the main CloudFront distribution"
  value       = aws_cloudfront_distribution.main_distribution.domain_name
}

output "app_domain_url" {
  description = "Primary public URL for the application"
  value       = "https://${var.apps_domain}"
}

output "api_gateway_url" {
  description = "URL of the API Gateway endpoint"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_endpoint" {
  description = "Base endpoint of the API Gateway"
  value = aws_apigatewayv2_api.main.api_endpoint
}

output "cognito_pool_id" {
  description = "ID of the Cognito User Pool"
  value = aws_cognito_user_pool.main.id
}

output "cognito_client_id" {
  description = "ID of the Cognito User Pool Client"
  value = aws_cognito_user_pool_client.client.id
}

output "cognito_endpoint" {
  description = "Endpoint of the Cognito User Pool"
  value = aws_cognito_user_pool.main.endpoint
}
