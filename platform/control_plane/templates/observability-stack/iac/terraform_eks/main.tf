terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.79.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = ">= 3.0"
    }
  }
}

provider "kubernetes" {
  host                   = aws_eks_cluster.langfuse.endpoint
  cluster_ca_certificate = base64decode(aws_eks_cluster.langfuse.certificate_authority[0].data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", aws_eks_cluster.langfuse.name, "--region", data.aws_region.current.id]
  }
}

provider "helm" {
  kubernetes {
    host                   = aws_eks_cluster.langfuse.endpoint
    cluster_ca_certificate = base64decode(aws_eks_cluster.langfuse.certificate_authority[0].data)

    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", aws_eks_cluster.langfuse.name, "--region", data.aws_region.current.id]
    }
  }
}

locals {
  tag_name        = lower(var.name) == "langfuse" ? "Langfuse ${var.environment}" : "Langfuse ${var.name} ${var.environment}"
  effective_domain = coalesce(var.domain, var.name)

  common_tags = {
    Environment = var.environment
    Project     = var.name
    ManagedBy   = "terraform"
  }
}
