output "s3_bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.apps.bucket
}

# output "cloudfront_distribution_id" {
#   description = "ID of the CloudFront distribution"
#   value       = aws_cloudfront_distribution.apps_distribution.id
# }

# output "cloudfront_domain_name" {
#   description = "Domain name of the CloudFront distribution"
#   value       = aws_cloudfront_distribution.apps_distribution.domain_name
# }

output "api_gateway_url" {
  description = "URL of the API Gateway endpoint"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "app_domain_url" {
  description = "URL of the PWA Shell"
  value       = "https://${var.apps_domain}"
} 