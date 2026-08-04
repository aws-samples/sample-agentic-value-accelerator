variable "vpc_id" {
  description = "VPC ID where the bastion will be placed"
  type        = string
}

variable "subnet_id" {
  description = "Private subnet ID for the bastion instance"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for the bastion"
  type        = string
  default     = "t3.micro"
}

variable "name_prefix" {
  description = "Name prefix for bastion resources"
  type        = string
  default     = "ava-litellm"
}

variable "tags" {
  description = "Tags to apply to bastion resources"
  type        = map(string)
  default     = {}
}
