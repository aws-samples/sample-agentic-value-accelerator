# EFS File System
resource "aws_efs_file_system" "langfuse" {
  creation_token  = "${var.name}-efs"
  encrypted       = true
  throughput_mode = "elastic"

  tags = {
    Name = local.tag_name
  }
}

# Mount targets in each private subnet
resource "aws_efs_mount_target" "eks" {
  count           = length(var.private_subnet_ids)
  file_system_id  = aws_efs_file_system.langfuse.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.eks.id]
}

# Security group for EFS
resource "aws_security_group" "efs" {
  name        = "${var.name}-efs"
  description = "Security group for EFS"
  vpc_id      = var.vpc_id

  ingress {
    description = "NFS from VPC"
    from_port   = 2049
    to_port     = 2049
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.tag_name} EFS"
  }
}

# EFS CSI Driver IAM Policy
resource "aws_iam_policy" "efs" {
  name = "${var.name}-efs"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:DescribeAccessPoints",
          "elasticfilesystem:DescribeFileSystems",
          "elasticfilesystem:DescribeMountTargets",
          "ec2:DescribeAvailabilityZones"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:CreateAccessPoint"
        ]
        Resource = "*"
        Condition = {
          StringLike = {
            "aws:RequestTag/efs.csi.aws.com/cluster" = "true"
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = "elasticfilesystem:DeleteAccessPoint"
        Resource = "*"
        Condition = {
          StringLike = {
            "aws:ResourceTag/efs.csi.aws.com/cluster" = "true"
          }
        }
      }
    ]
  })

  tags = {
    Name = "${local.tag_name} EFS"
  }
}

# EFS CSI Driver IAM Role
resource "aws_iam_role" "efs" {
  name = "${var.name}-efs-csi"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${replace(aws_eks_cluster.langfuse.identity[0].oidc[0].issuer, "https://", "")}"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(aws_eks_cluster.langfuse.identity[0].oidc[0].issuer, "https://", "")}:sub" = "system:serviceaccount:kube-system:efs-csi-controller-sa"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "efs" {
  policy_arn = aws_iam_policy.efs.arn
  role       = aws_iam_role.efs.name
}

resource "kubernetes_storage_class" "efs" {
  metadata {
    name = "efs"
  }
  storage_provisioner = "efs.csi.aws.com"
}