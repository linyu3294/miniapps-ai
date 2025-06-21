variable "region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix for all resources"
  type        = string
  default     = "miniapps-ai"
}

variable "environment" {
  description = "Environment (e.g., dev, prod)"
  type        = string
  default     = "prod"
}

variable "api_stage_name" {
  description = "API Gateway stage name"
  type        = string
  default     = "v1"
}

variable "client_domain" {
  description = "Allowed client domain for CORS"
  type        = string
}

variable "allowed_origins" {
description = "List of allowed origins for CORS"
type        = list(string)
}

variable "route53_zone_id" {
  description = "The Route 53 Hosted Zone ID for the app domain."
  type        = string
}

variable "apps_domain" {
  description = "The domain name for the PWA shell app (e.g., app.example.com)."
  type        = string
}
