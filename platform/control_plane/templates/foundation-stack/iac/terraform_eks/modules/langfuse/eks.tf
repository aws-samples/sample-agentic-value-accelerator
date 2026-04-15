resource "aws_eks_cluster" "langfuse" {
  name     = var.name
  role_arn = aws_iam_role.eks.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    security_group_ids      = [aws_security_group.eks.id]
  }

  enabled_cluster_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  tags = {
    Name = local.tag_name
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
    aws_iam_role_policy_attachment.eks_service_policy,
    aws_cloudwatch_log_group.eks
  ]
}

# Enable IRSA
resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.langfuse.identity[0].oidc[0].issuer

  tags = {
    Name = local.tag_name
  }
}

# Get EKS OIDC certificate
data "tls_certificate" "eks" {
  url = aws_eks_cluster.langfuse.identity[0].oidc[0].issuer
}

# Fargate Profile Role
resource "aws_iam_role" "fargate" {
  name = "${var.name}-fargate"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks-fargate-pods.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.tag_name} Fargate"
  }
}

resource "aws_iam_role_policy_attachment" "fargate_pod_execution_role_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy"
  role       = aws_iam_role.fargate.name
}

# Fargate Profiles for all configured namespaces
resource "aws_eks_fargate_profile" "namespaces" {
  for_each = toset(var.fargate_profile_namespaces)

  cluster_name           = aws_eks_cluster.langfuse.name
  fargate_profile_name   = "${var.name}-${each.value}"
  pod_execution_role_arn = aws_iam_role.fargate.arn
  subnet_ids             = var.private_subnet_ids

  selector {
    namespace = each.value
  }

  tags = {
    Name = local.tag_name
  }
}

resource "aws_security_group" "eks" {
  name        = "${var.name}-eks"
  description = "Security group for Langfuse EKS cluster"
  vpc_id      = var.vpc_id

  tags = {
    Name = "${local.tag_name} EKS"
  }
}

resource "aws_security_group_rule" "eks_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.eks.id
}

resource "aws_security_group_rule" "eks_vpc" {
  type              = "ingress"
  from_port         = 0
  to_port           = 65535
  protocol          = "tcp"
  cidr_blocks       = [var.vpc_cidr]
  security_group_id = aws_security_group.eks.id
}

resource "aws_iam_role" "eks" {
  name = "${var.name}-eks"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "eks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.tag_name} EKS"
  }
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks.name
}

resource "aws_iam_role_policy_attachment" "eks_service_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSServicePolicy"
  role       = aws_iam_role.eks.name
}

resource "aws_cloudwatch_log_group" "eks" {
  name              = "/aws/eks/${var.name}/cluster"
  retention_in_days = 30
}

# On Fargate-only clusters, CoreDNS is deployed before Fargate profiles exist,
# causing pods to stay Pending. This restarts CoreDNS after profiles are ready
# so the Fargate scheduler can place the pods.
resource "null_resource" "coredns_restart" {
  triggers = {
    cluster_name = aws_eks_cluster.langfuse.name
  }

  provisioner "local-exec" {
    command = <<-EOT
      aws eks update-kubeconfig --name ${aws_eks_cluster.langfuse.name} --region ${data.aws_region.current.id} --kubeconfig /tmp/kubeconfig-${aws_eks_cluster.langfuse.name}
      kubectl --kubeconfig /tmp/kubeconfig-${aws_eks_cluster.langfuse.name} rollout restart deployment coredns -n kube-system
      kubectl --kubeconfig /tmp/kubeconfig-${aws_eks_cluster.langfuse.name} rollout status deployment coredns -n kube-system --timeout=300s
      rm -f /tmp/kubeconfig-${aws_eks_cluster.langfuse.name}
    EOT
  }

  depends_on = [aws_eks_fargate_profile.namespaces]
}

# Tag public subnets for ALB auto-discovery
resource "aws_ec2_tag" "public_subnet_elb" {
  count       = length(var.public_subnet_ids)
  resource_id = var.public_subnet_ids[count.index]
  key         = "kubernetes.io/role/elb"
  value       = "1"
}

# Tag private subnets for internal LB auto-discovery
resource "aws_ec2_tag" "private_subnet_internal_elb" {
  count       = length(var.private_subnet_ids)
  resource_id = var.private_subnet_ids[count.index]
  key         = "kubernetes.io/role/internal-elb"
  value       = "1"
} 