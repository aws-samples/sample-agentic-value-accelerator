# -----------------------------------------------------------------------------
# Cognito User Groups
# -----------------------------------------------------------------------------

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  description  = "Administrators"
  precedence   = 1
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_group" "user" {
  name         = "user"
  description  = "Standard users"
  precedence   = 10
  user_pool_id = aws_cognito_user_pool.this.id
}
