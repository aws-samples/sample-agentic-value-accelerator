# ============================================================================
# Self-signup Lambda triggers
# ============================================================================
#
# Two Python 3.12 Lambdas wired to the Cognito user pool:
#
#   * pre_signup_domain_check  — rejects public-mail-provider domains so
#     only corporate emails can register.
#   * post_confirmation_viewer — puts the confirmed user into the 'viewer'
#     group (least-privilege by default).
#
# Both are packaged from local source with archive_file. Source lives under
# lambda_src/<function>/index.py inside this module.

data "archive_file" "pre_signup_domain_check" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/pre_signup_domain_check"
  output_path = "${path.module}/build/pre_signup_domain_check.zip"
}

data "archive_file" "post_confirmation_viewer" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/post_confirmation_assign_viewer"
  output_path = "${path.module}/build/post_confirmation_assign_viewer.zip"
}

# ----------------------------------------------------------------------------
# IAM
# ----------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "pre_signup" {
  name               = "${var.name_prefix}-cognito-pre-signup-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "pre_signup_basic" {
  role       = aws_iam_role.pre_signup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role" "post_confirmation" {
  name               = "${var.name_prefix}-cognito-post-confirm-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "post_confirmation_basic" {
  role       = aws_iam_role.post_confirmation.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Scope the group-assignment permission to this pool only.
resource "aws_iam_role_policy" "post_confirmation_group_write" {
  name = "add-user-to-viewer-group"
  role = aws_iam_role.post_confirmation.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "cognito-idp:AdminAddUserToGroup"
      Resource = aws_cognito_user_pool.main.arn
    }]
  })
}

# ----------------------------------------------------------------------------
# Functions
# ----------------------------------------------------------------------------

resource "aws_lambda_function" "pre_signup_domain_check" {
  function_name    = "${var.name_prefix}-cognito-pre-signup-domain-check"
  role             = aws_iam_role.pre_signup.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.pre_signup_domain_check.output_path
  source_code_hash = data.archive_file.pre_signup_domain_check.output_base64sha256
  timeout          = 5
  memory_size      = 128
  tags             = var.tags
}

resource "aws_lambda_function" "post_confirmation_viewer" {
  function_name    = "${var.name_prefix}-cognito-post-confirm-viewer"
  role             = aws_iam_role.post_confirmation.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.post_confirmation_viewer.output_path
  source_code_hash = data.archive_file.post_confirmation_viewer.output_base64sha256
  timeout          = 5
  memory_size      = 128
  environment {
    variables = {
      # Literal group name (not a resource reference) so we don't create a
      # cycle: pool → lambda_config → this lambda → user_group → pool.
      # The Cognito user_group resource below uses the same literal.
      DEFAULT_GROUP = "viewer"
    }
  }
  tags = var.tags
}

# ----------------------------------------------------------------------------
# Invoke permissions — Cognito needs to be allowed to call each Lambda.
# ----------------------------------------------------------------------------

resource "aws_lambda_permission" "cognito_invoke_pre_signup" {
  statement_id  = "AllowCognitoInvokePreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup_domain_check.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

resource "aws_lambda_permission" "cognito_invoke_post_confirmation" {
  statement_id  = "AllowCognitoInvokePostConfirmation"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_confirmation_viewer.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
