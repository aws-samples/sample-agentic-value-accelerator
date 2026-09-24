# ============================================================================
# PostAuthentication trigger — audit login events into DynamoDB
# ============================================================================
#
# Fires after every successful Cognito sign-in and appends a row to the
# login-events audit table. Runs alongside signup_lambdas.tf; the target
# pool wires this Lambda into lambda_config.post_authentication.
#
# Table name and ARN are passed in from the caller (see modules/cognito/
# variables.tf) so the DDB module remains the source of truth for the
# table's existence and encryption/PITR posture.

data "archive_file" "post_auth_log_login" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_src/post_auth_log_login"
  output_path = "${path.module}/build/post_auth_log_login.zip"
}

resource "aws_iam_role" "post_authentication" {
  name               = "${var.name_prefix}-cognito-post-auth-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "post_authentication_basic" {
  role       = aws_iam_role.post_authentication.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Scope write access to the single login-events table.
resource "aws_iam_role_policy" "post_authentication_ddb_write" {
  name = "write-login-events"
  role = aws_iam_role.post_authentication.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:PutItem"]
      Resource = var.login_events_table_arn
    }]
  })
}

resource "aws_lambda_function" "post_auth_log_login" {
  function_name    = "${var.name_prefix}-cognito-post-auth-log-login"
  role             = aws_iam_role.post_authentication.arn
  runtime          = "python3.12"
  handler          = "index.handler"
  filename         = data.archive_file.post_auth_log_login.output_path
  source_code_hash = data.archive_file.post_auth_log_login.output_base64sha256
  timeout          = 5
  memory_size      = 128
  environment {
    variables = {
      LOGIN_EVENTS_TABLE = var.login_events_table_name
    }
  }
  tags = var.tags
}

resource "aws_lambda_permission" "cognito_invoke_post_auth" {
  statement_id  = "AllowCognitoInvokePostAuthentication"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.post_auth_log_login.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}
