provider "aws" {
  region = var.region
}

locals {
  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------
# Shared AWS Resources
# ---------------------------------------------
resource "aws_iam_role" "lambda_app_exec" {
  name = "${var.project_name}-${var.environment}-lambda-app-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "lambda_app_policy" {
  role       = aws_iam_role.lambda_app_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------
# S3 Bucket for App Assets
# ---------------------------------------------
resource "aws_s3_bucket" "apps" {
  bucket = "${var.project_name}-apps-${var.environment}"
  tags   = local.tags
}

# ---------------------------------------------
# Lambda Function for API
# ---------------------------------------------
resource "aws_lambda_function" "subscriber_api" {
  function_name = "${var.project_name}-subscriber-api-${var.environment}"
  role          = aws_iam_role.lambda_app_exec.arn
  handler       = "bootstrap"
  runtime       = "provided.al2"
  filename      = "${path.module}/lambda/publisher/publisher.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/publisher/publisher.zip")
  tags          = local.tags
}

# ---------------------------------------------
# API Gateway V2 (HTTP API)
# ---------------------------------------------
resource "aws_apigatewayv2_api" "subscriber_api" {
  name          = "${var.project_name}-subscriber-api-${var.environment}"
  protocol_type = "HTTP"
  tags          = local.tags
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id                 = aws_apigatewayv2_api.subscriber_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.subscriber_api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default_route" {
  api_id    = aws_apigatewayv2_api.subscriber_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_lambda_permission" "apigw_lambda" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.subscriber_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.subscriber_api.execution_arn}/*/*"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.subscriber_api.id
  name        = "$default"
  auto_deploy = true
}

# ---------------------------------------------
# CloudFront Distribution for S3 Bucket
# ---------------------------------------------
resource "aws_cloudfront_origin_access_identity" "apps_oai" {
  comment = "OAI for apps S3 bucket"
}

resource "aws_s3_bucket_policy" "apps_policy" {
  bucket = aws_s3_bucket.apps.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          AWS = aws_cloudfront_origin_access_identity.apps_oai.iam_arn
        },
        Action = "s3:GetObject",
        Resource = "${aws_s3_bucket.apps.arn}/*"
      }
    ]
  })
}

resource "aws_cloudfront_distribution" "apps_distribution" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Apps static assets distribution"
  default_root_object = "index.html"

  origin {
    domain_name = aws_s3_bucket.apps.bucket_regional_domain_name
    origin_id   = "appsS3Origin"
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.apps_oai.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "appsS3Origin"
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  price_class = "PriceClass_100"
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    cloudfront_default_certificate = true
  }
  tags = local.tags
}

# ---------------------------------------------
# Route 53 Record for CloudFront
# ---------------------------------------------
resource "aws_route53_record" "apps" {
  zone_id = var.route53_zone_id
  name    = var.apps_domain
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.apps_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.apps_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

