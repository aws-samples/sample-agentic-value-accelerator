# =============================================================================
# SSM-Enabled Bastion Instance for VPC Validation
# =============================================================================
# Provisions a small EC2 instance with SSM Session Manager access for
# running validation commands against internal VPC resources (ALB, RDS, etc.)
# No SSH key, no public IP — access only via SSM.
#
# Usage:
#   aws ssm start-session --target <instance_id> --profile <your-profile> --region us-east-2
# =============================================================================

data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_iam_role" "bastion" {
  name = "${var.name_prefix}-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.bastion.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${var.name_prefix}-bastion-profile"
  role = aws_iam_role.bastion.name
}

resource "aws_security_group" "bastion" {
  name_prefix = "${var.name_prefix}-bastion-"
  description = "Security group for SSM bastion - outbound only"
  vpc_id      = var.vpc_id

  # Outbound to VPC (for ALB, RDS, Redis access)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound (SSM, ALB, RDS, Redis, internet)"
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bastion-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  iam_instance_profile   = aws_iam_instance_profile.bastion.name
  vpc_security_group_ids = [aws_security_group.bastion.id]

  # No public IP — SSM access only
  associate_public_ip_address = false

  # Install curl and jq on boot for validation commands
  user_data = <<-EOF
    #!/bin/bash
    dnf install -y curl jq
  EOF

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required" # IMDSv2 only
  }

  tags = merge(var.tags, {
    Name = "${var.name_prefix}-bastion"
  })
}
