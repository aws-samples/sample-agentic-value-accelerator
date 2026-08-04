# -----------------------------------------------------------------------------
# Cognito Resource Server (OAuth2 API scopes)
# -----------------------------------------------------------------------------

resource "aws_cognito_resource_server" "this" {
  identifier   = var.resource_server_identifier
  name         = "${var.project_name} API"
  user_pool_id = aws_cognito_user_pool.this.id

  dynamic "scope" {
    for_each = var.resource_server_scopes
    content {
      scope_name        = scope.value.name
      scope_description = scope.value.description
    }
  }
}