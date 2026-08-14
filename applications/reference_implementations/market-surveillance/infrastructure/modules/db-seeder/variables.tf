variable "name_prefix" {
  description = "Resource name prefix (typically 'market-surveillance-<env>')."
  type        = string
}

variable "environment" {
  description = "Environment (dev/staging/prod)."
  type        = string
}

variable "vpc_subnet_ids" {
  description = "Private subnet IDs the Lambda ENIs will attach to. Must have route to Aurora."
  type        = list(string)
}

variable "vpc_security_group_ids" {
  description = "Security group IDs for the Lambda ENIs. Must be allowed in by the Aurora security group on port 5432."
  type        = list(string)
}

variable "db_secret_arn" {
  description = "Secrets Manager ARN of the DB credentials secret."
  type        = string
}

variable "db_name" {
  description = "Aurora database name (fallback if the secret doesn't carry DBNAME)."
  type        = string
  default     = ""
}

variable "seeding_scripts_dir" {
  description = "Filesystem path to the market-surveillance seeding_scripts/ package that gets zipped into the Lambda deployment."
  type        = string
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds. 900 is the max; seeding typically finishes in <90s but data_gen can slow on cold-start."
  type        = number
  default     = 900
}

variable "lambda_memory_mb" {
  description = "Lambda memory in MB. Higher memory also gives more CPU — data_gen benefits from >=1024 MB."
  type        = number
  default     = 1024
}

variable "tags" {
  description = "Common tags applied to all resources."
  type        = map(string)
  default     = {}
}
