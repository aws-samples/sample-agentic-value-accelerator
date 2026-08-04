variable "aws_region" {
  description = "AWS region for the spike"
  type        = string
  default     = "us-east-1"
}

variable "image_tag" {
  description = "ECR tag for the spike agent image"
  type        = string
  default     = "latest"
}
