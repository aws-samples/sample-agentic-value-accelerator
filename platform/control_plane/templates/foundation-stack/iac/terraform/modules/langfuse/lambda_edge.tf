# -----------------------------------------------------------------------------
# Lambda@Edge for auto-login to Langfuse
# Authenticates users transparently using the init admin credentials
# -----------------------------------------------------------------------------

data "archive_file" "auto_login" {
  type        = "zip"
  output_path = "${path.module}/.lambda/auto_login.zip"

  source {
    content = templatefile("${path.module}/lambda_auto_login.js", {
      langfuse_email    = var.langfuse_init_user_email
      langfuse_password = var.langfuse_init_user_password
    })
    filename = "index.js"
  }
}

resource "aws_iam_role" "lambda_edge" {
  name = "${var.name}-lambda-edge"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = [
            "lambda.amazonaws.com",
            "edgelambda.amazonaws.com"
          ]
        }
      }
    ]
  })

  tags = {
    Name = "${local.tag_name} Lambda@Edge"
  }
}

resource "aws_iam_role_policy_attachment" "lambda_edge_basic" {
  role       = aws_iam_role.lambda_edge.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "auto_login" {
  function_name = "${var.name}-auto-login"
  role          = aws_iam_role.lambda_edge.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 10
  publish       = true

  filename         = data.archive_file.auto_login.output_path
  source_code_hash = data.archive_file.auto_login.output_base64sha256

  tags = {
    Name = "${local.tag_name} Auto Login"
  }
}
