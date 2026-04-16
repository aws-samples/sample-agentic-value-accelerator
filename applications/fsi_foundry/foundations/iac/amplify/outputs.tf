# =============================================================================
# Outputs for Amplify Hosting
# =============================================================================

output "app_id" {
  description = "Amplify App ID"
  value       = aws_amplify_app.testing_dashboard.id
}

output "default_domain" {
  description = "Default Amplify domain"
  value       = aws_amplify_app.testing_dashboard.default_domain
}

output "app_url" {
  description = "URL for the deployed app"
  value       = local.is_manual ? "https://${aws_amplify_branch.manual[0].branch_name}.${aws_amplify_app.testing_dashboard.default_domain}" : "https://${aws_amplify_branch.main[0].branch_name}.${aws_amplify_app.testing_dashboard.default_domain}"
}

output "deployment_mode" {
  description = "Deployment mode (manual or git)"
  value       = local.is_manual ? "manual" : "git"
}

output "manual_deploy_instructions" {
  description = "Instructions for manual deployment"
  value       = local.is_manual ? "Build with 'npm run build', zip the build folder, then upload via Amplify Console or use: aws amplify start-deployment --app-id ${aws_amplify_app.testing_dashboard.id} --branch-name main --source-url <S3_URL>" : "N/A - Using git-based deployment"
}
