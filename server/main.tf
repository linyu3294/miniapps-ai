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

resource "aws_cognito_user_group" "publisher" {
  name         = "Publisher"
  description  = "Publisher group with access to publishing features"
  user_pool_id = aws_cognito_user_pool.main.id
  precedence   = 1
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

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "default"
  auto_deploy = true
}

# ---------------------------------------------
# Publisher Lambda Function
# ---------------------------------------------
resource "aws_lambda_function" "publisher" {
  filename         = "${path.module}/lambda/publisher/publisher.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda/publisher/publisher.zip")
  function_name    = "${var.project_name}-publisher-${var.environment}"
  role            = aws_iam_role.lambda_app_exec.arn
  handler         = "publisher"
  runtime         = "provided.al2"
  architectures   = ["x86_64"]

  environment {
    variables = {
      apps_bucket = aws_s3_bucket.apps.bucket
    }
  }

  tags = local.tags
}

# ---------------------------------------------
# Outputs
# ---------------------------------------------
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

