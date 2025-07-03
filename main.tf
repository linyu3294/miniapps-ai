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

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      bucket,
      tags,
    ]
  }
}

resource "aws_s3_bucket_cors_configuration" "apps" {
  bucket = aws_s3_bucket.apps.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT"]
    allowed_origins = ["http://localhost:5173", var.client_domain]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_policy" "apps" {
  bucket = aws_s3_bucket.apps.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow",
        Principal = {
          Service = "cloudfront.amazonaws.com"
        },
        Action    = "s3:GetObject",
        Resource  = "${aws_s3_bucket.apps.arn}/*",
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main_distribution.arn
          }
        }
      }
    ]
  })
}

# ---------------------------------------------
# Cognito User Pool for Authentication
# ---------------------------------------------
resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-user-pool-${var.environment}"

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  schema {
    attribute_data_type = "String"
    name               = "email"
    required           = true
    mutable           = true

    string_attribute_constraints {
      min_length = 7
      max_length = 256
    }
  }

   schema {
    attribute_data_type = "String"
    name               = "preferred_roles"
    required           = false
    mutable           = true
    
    string_attribute_constraints {
      min_length = 1
      max_length = 100
    }
  }

  lambda_config {
    post_confirmation = aws_lambda_function.user.arn
  }

  tags = local.tags
}

resource "aws_cognito_user_pool_client" "client" {
  name         = "${var.project_name}-app-client-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_PASSWORD_AUTH"
  ]
}

resource "aws_cognito_user_group" "subscriber" {
  name         = "Subscriber"
  description  = "Subscriber group with access to app marketplace"
  user_pool_id = aws_cognito_user_pool.main.id
  precedence   = 1
}

resource "aws_cognito_user_group" "publisher" {
  name         = "Publisher"
  description  = "Publisher group with access to publishing features"
  user_pool_id = aws_cognito_user_pool.main.id
  precedence   = 2
}

# ---------------------------------------------
# API Gateway V2 (HTTP API) Configuration
# ---------------------------------------------

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project_name}-api-${var.environment}"
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_methods = ["GET", "POST", "PUT", "DELETE"]
    allow_origins = concat([var.client_domain], var.allowed_origins)
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 300
  }
  
  tags = local.tags
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name            = "cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.client.id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

// ----- TODO: Remove publisher lambda api gateway integration --------

resource "aws_apigatewayv2_integration" "publisher" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  
  integration_method = "POST"
  integration_uri    = aws_lambda_function.publisher.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "publisher" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /publish/{app-slug}/version/{version-id}"
  target    = "integrations/${aws_apigatewayv2_integration.publisher.id}"

  authorization_type = "JWT"
  authorizer_id     = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "publisher_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.publisher.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

// ----- TODO: Remove publisher lambda api gateway integration --------





resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "default"
  auto_deploy = true
}


# ---------------------------------------------
# User Lambda Function
# ---------------------------------------------
resource "aws_iam_role" "user_exec" {
  name = "${var.project_name}-${var.environment}-lambda-user-exec-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_lambda_function" "user" {
  filename         = "server/lambda/user/user.zip"
  source_code_hash = filebase64sha256("server/lambda/user/user.zip")
  function_name    = "${var.project_name}-user-${var.environment}"
  role            = aws_iam_role.user_exec.arn
  handler         = "user"
  runtime         = "provided.al2"
  architectures   = ["x86_64"]

  environment {
    variables = {}
  }

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "user_basic_policy" {
  role       = aws_iam_role.user_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "user_cognito" {
  name = "${var.project_name}-${var.environment}-user-cognito-policy"
  role = aws_iam_role.user_exec.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminUpdateUserAttributes"
        ],
        Resource = aws_cognito_user_pool.main.arn
      }
    ]
  })
}

resource "aws_lambda_permission" "user_cognito_trigger" {
  statement_id  = "AllowCognitoPostConfirmation"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.user.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

# User role management API Gateway integration
resource "aws_apigatewayv2_integration" "user" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  
  integration_method = "POST"
  integration_uri    = aws_lambda_function.user.invoke_arn
  payload_format_version = "2.0"
  
  depends_on = [aws_lambda_function.user, aws_cognito_user_pool.main]
}

resource "aws_apigatewayv2_route" "user" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "PUT /user-role"
  target    = "integrations/${aws_apigatewayv2_integration.user.id}"

  authorization_type = "JWT"
  authorizer_id     = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_lambda_permission" "user_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.user.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ---------------------------------------------
# Publisher Lambda Function
# ---------------------------------------------
resource "aws_iam_role" "publisher_exec" {
  name = "${var.project_name}-${var.environment}-lambda-publisher-exec-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow",
      Action    = "sts:AssumeRole",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_lambda_function" "publisher" {
  filename         = "server/lambda/publisher/publisher.zip"
  source_code_hash = filebase64sha256("server/lambda/publisher/publisher.zip")
  function_name    = "${var.project_name}-publisher-${var.environment}"
  role            = aws_iam_role.publisher_exec.arn
  handler         = "publisher"
  runtime         = "provided.al2"
  architectures   = ["x86_64"]
  depends_on = [aws_dynamodb_table.app_table]

  environment {
    variables = {
      apps_bucket = aws_s3_bucket.apps.bucket
      app_table = aws_dynamodb_table.app_table.name
    }
  }

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "publisher_basic_policy" {
  role       = aws_iam_role.publisher_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "publisher_dynamodb_policy" {
  name = "${var.project_name}-${var.environment}-lambda-publisher-dynamodb-policy"
  role = aws_iam_role.publisher_exec.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem"
        ],
        Resource = [
          aws_dynamodb_table.app_table.arn,
          "${aws_dynamodb_table.app_table.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "publisher_s3_policy" {
  name = "${var.project_name}-${var.environment}-lambda-publisher-s3-policy"
  role = aws_iam_role.publisher_exec.id

   policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ],
        Resource = "${aws_s3_bucket.apps.arn}/*"
      },
    ]
  })
}

# ---------------------------------------------
# App Table
# ---------------------------------------------

resource "aws_dynamodb_table" "app_table" {
  name           = "${var.project_name}-${var.environment}-app-table"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "appId"

  attribute {
    name = "appId"
    type = "S"
  }

  tags = local.tags
}

# ---------------------------------------------
# PWA Shell App & Modern Access Control
# ---------------------------------------------
locals {
  pwa_shell_bucket_name = "${var.project_name}-pwa-shell-${var.environment}"
}

resource "aws_s3_bucket" "pwa_shell_bucket" {
  bucket = local.pwa_shell_bucket_name

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      bucket,
      tags,
    ]
  }
}

resource "aws_cloudfront_origin_access_control" "main_oac" {
  name                              = "${var.project_name}-oac-${var.environment}"
  description                       = "Main OAC for the MiniApps Platform"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "pwa_shell_bucket_policy" {
  bucket = aws_s3_bucket.pwa_shell_bucket.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action    = "s3:GetObject",
        Resource  = "${aws_s3_bucket.pwa_shell_bucket.arn}/*",
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main_distribution.arn
          }
        }
      }
    ]
  })
}

# ---------------------------------------------
# Universal CloudFront Function
# ---------------------------------------------
resource "aws_cloudfront_function" "path_rewrite_function" {
  name    = "${var.project_name}-path-rewrite"
  runtime = "cloudfront-js-1.0"
  comment = "Rewrites directory-like URLs to index.html"
  publish = true
  code    = file("${path.module}/cloudfront-function/rewrite-url.js")
}

# ---------------------------------------------
# Main Multi-Origin CloudFront Distribution
# ---------------------------------------------
# Using short cache for development
# TODO: Use a more appropriate cache policy for production (Managed-CachingOptimized)
resource "aws_cloudfront_cache_policy" "short_cache" {
  name        = "ShortCache"
  comment     = "Short cache for development"
  default_ttl = 60     # 1 minute
  max_ttl     = 300    # 5 minutes
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip = true
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    cookies_config {
      cookie_behavior = "none"
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "service_worker_allowed" {
  name = "ServiceWorkerAllowedHeader"

  custom_headers_config {
    items {
      header   = "Service-Worker-Allowed"
      value    = "/"
      override = true
    }
  }
}

resource "aws_cloudfront_distribution" "main_distribution" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Main Distribution for MiniApps AI Platform"
  default_root_object = "index.html"
  
  aliases = ["*.${var.root_domain}"]

  # Origin 1: PWA Shell Bucket (Default)
  origin {
    domain_name              = aws_s3_bucket.pwa_shell_bucket.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.main_oac.id
    origin_id                = local.pwa_shell_bucket_name
  }

  # Origin 2: Mini-Apps Bucket
  origin {
    domain_name              = aws_s3_bucket.apps.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.main_oac.id
    origin_id                = aws_s3_bucket.apps.id
  }

  # Default Behavior: Serves the PWA Shell from its bucket
  default_cache_behavior {
    target_origin_id = local.pwa_shell_bucket_name
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    
    viewer_protocol_policy = "redirect-to-https"
    # cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
    
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.path_rewrite_function.arn
    }
  }

  # ordered_cache_behavior {
  #   path_pattern     = "/assets/*"
  #   target_origin_id = local.pwa_shell_bucket_name
  #   allowed_methods  = ["GET", "HEAD", "OPTIONS"]
  #   cached_methods   = ["GET", "HEAD"]
  #   viewer_protocol_policy = "redirect-to-https"
  #   compress               = true
  #   cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  # }
  ordered_cache_behavior {
    path_pattern     = "/app/*/sw.js"
    target_origin_id = aws_s3_bucket.apps.id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.service_worker_allowed.id
  }
  ordered_cache_behavior {
    path_pattern     = "/app/*/service-worker.js"
    target_origin_id = aws_s3_bucket.apps.id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.service_worker_allowed.id
  }
  # Path-Based Behaviors: Serve mini-app assets (with file extensions) from the 'apps' bucket
  ordered_cache_behavior {
    path_pattern     = "/app/*.js"
    target_origin_id = aws_s3_bucket.apps.id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
  }
  ordered_cache_behavior {
    path_pattern     = "/app/*.json"
    target_origin_id = aws_s3_bucket.apps.id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
  }
  ordered_cache_behavior {
    path_pattern     = "/app/*.png"
    target_origin_id = aws_s3_bucket.apps.id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
  }
  ordered_cache_behavior {
    path_pattern     = "/app/*.ico"
    target_origin_id = aws_s3_bucket.apps.id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
  }
  ordered_cache_behavior {
    path_pattern     = "/app/*.onnx"
    target_origin_id = aws_s3_bucket.apps.id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
  }
  ordered_cache_behavior {
    path_pattern     = "/app/*.html"
    target_origin_id = aws_s3_bucket.apps.id
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.short_cache.id
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate_validation.cert.certificate_arn
    ssl_support_method  = "sni-only"
  }

  tags = local.tags
}

# ---------------------------------------------
# DNS and Certificate
# ---------------------------------------------

data "aws_route53_zone" "main" {
  name = var.root_domain
}

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = "*.${var.root_domain}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.main_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_acm_certificate" "cert" {
  domain_name       = "*.${var.root_domain}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "cert" {
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

resource "aws_s3_bucket_notification" "apps_upload_notification" {
  bucket = aws_s3_bucket.apps.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.unzip.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
    filter_suffix       = ".zip"
  }

  depends_on = [aws_lambda_permission.s3_invoke_unzip]
}

resource "aws_lambda_permission" "s3_invoke_unzip" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.unzip.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.apps.arn
}

# ---------------------------------------------
# Unzip Lambda for Published Apps
# ---------------------------------------------
resource "aws_lambda_function" "unzip" {
  filename         = "server/lambda/unzip/unzip.zip"
  source_code_hash = filebase64sha256("server/lambda/unzip/unzip.zip")
  function_name    = "${var.project_name}-unzip-${var.environment}"
  role             = aws_iam_role.unzip_exec.arn
  handler          = "unzip"
  runtime          = "provided.al2"
  architectures    = ["x86_64"]
  timeout          = 30

  environment {
    variables = {
      apps_bucket = aws_s3_bucket.apps.bucket
    }
  }

  tags = local.tags
}

resource "aws_iam_role" "unzip_exec" {
  name = "${var.project_name}-${var.environment}-lambda-unzip-exec-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "unzip_basic_policy" {
  role       = aws_iam_role.unzip_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "unzip_s3_policy" {
  name = "${var.project_name}-${var.environment}-lambda-unzip-s3-policy"
  role = aws_iam_role.unzip_exec.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ],
        Resource = "${aws_s3_bucket.apps.arn}/*"
      },
    ]
  })
}
