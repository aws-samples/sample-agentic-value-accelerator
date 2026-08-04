# CloudFront Functions for the LLM Gateway admin UI.
#
# Two functions, both on the default cache behavior:
#   - viewer-request: AVA SSO gate + LiteLLM cookie mint (cf_auth.js)
#   - viewer-response: strip X-Frame-Options + CSP frame-ancestors so the
#                      admin UI can be iframed inside the AVA console
#
# Enabled only when fsi_app_signing_secret is set — otherwise the gate is
# skipped and the module behaves the same as before (unprotected).
#
# CloudFront Functions run at every edge globally with no us-east-1
# constraint (unlike Lambda@Edge), no cold start, and no IAM role.

locals {
  auth_enabled = var.fsi_app_signing_secret != ""
}

resource "aws_cloudfront_function" "auth" {
  count   = local.auth_enabled ? 1 : 0
  name    = "${var.name}-auth"
  runtime = "cloudfront-js-2.0"
  publish = true

  code = templatefile("${path.module}/cf_auth.js.tftpl", {
    signing_secret     = var.fsi_app_signing_secret
    login_url          = var.ava_ui_login_url
    litellm_master_key = var.master_key
  })
}

resource "aws_cloudfront_function" "frame_headers" {
  count   = local.auth_enabled ? 1 : 0
  name    = "${var.name}-frame-headers"
  runtime = "cloudfront-js-2.0"
  publish = true

  code = file("${path.module}/cf_frame_headers.js")
}
