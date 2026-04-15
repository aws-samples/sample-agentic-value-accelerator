# Amplify Hosting Infrastructure

Terraform module for deploying the FSI Foundry Testing Dashboard to AWS Amplify Hosting.

## Deployment Modes

### Option 1: Manual Deployment (No Git Required)

Best for internal GitLab repos (like gitlab.aws.dev) or quick deployments without CI/CD.

#### Step 1: Deploy Amplify Infrastructure

```bash
cd platform/iac/amplify
terraform init

# Deploy Amplify app (manual mode - no repository_url)
terraform apply \
  -var="cognito_user_pool_id=us-east-1_xxxxxxxxx" \
  -var="cognito_user_pool_client_id=xxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -var="cognito_identity_pool_id=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Note the `app_id` from the Terraform output (e.g., `dyb6xhtrfaq0s`).

#### Step 2: Build the React App

```bash
cd platform/ui/testing-dashboard
npm install
npm run build
```

#### Step 3: Create Deployment Zip

```bash
cd build
zip -r ../deploy.zip .
cd ..
```

#### Step 4: Create Deployment Job

```bash
aws amplify create-deployment \
  --app-id <APP_ID> \
  --branch-name main \
  --region us-east-1
```

This returns a `jobId` and `zipUploadUrl`. Save both - the URL is very long!

#### Step 5: Upload the Zip

```bash
# Use the FULL zipUploadUrl from step 4 (it's very long, copy carefully)
curl -T deploy.zip "<FULL_ZIP_UPLOAD_URL>"
```

A successful upload returns no output.

#### Step 6: Start the Deployment

```bash
aws amplify start-deployment \
  --app-id <APP_ID> \
  --branch-name main \
  --job-id <JOB_ID> \
  --region us-east-1
```

#### Step 7: Check Deployment Status

```bash
aws amplify get-job \
  --app-id <APP_ID> \
  --branch-name main \
  --job-id <JOB_ID> \
  --region us-east-1
```

Once status shows `SUCCEED`, your app is live at:
`https://main.<APP_ID>.amplifyapp.com`

#### Alternative: Console Upload

You can also drag-and-drop `deploy.zip` in the Amplify Console under your app's "Hosting" > "Deploy" section.

### Option 2: Git-Based Deployment (CI/CD)

Best for GitHub or GitLab.com repos with automatic deployments on push.

```bash
cd platform/iac/amplify
terraform init

terraform apply \
  -var="repository_url=https://github.com/your-org/ava" \
  -var="github_access_token=ghp_xxxxxxxxxxxx" \
  -var="cognito_user_pool_id=..." \
  -var="cognito_user_pool_client_id=..." \
  -var="cognito_identity_pool_id=..."
```

**Note:** GitLab Enterprise (gitlab.aws.dev) is NOT supported by Amplify for git-based deployments. Use manual mode (Option 1) instead.

## Prerequisites

- AWS CLI configured with appropriate permissions
- Terraform >= 1.0
- Cognito deployed first (`platform/iac/cognito/`)
- Node.js 18+ (for building the React app)

## Redeploying Updates

After making changes to the UI, repeat steps 2-7 from Option 1:

```bash
# Quick redeploy script
cd platform/ui/testing-dashboard
npm run build
cd build && zip -r ../deploy.zip . && cd ..

# Create new deployment
aws amplify create-deployment --app-id <APP_ID> --branch-name main --region us-east-1
# Copy the zipUploadUrl and jobId from output

curl -T deploy.zip "<ZIP_UPLOAD_URL>"
aws amplify start-deployment --app-id <APP_ID> --branch-name main --job-id <JOB_ID> --region us-east-1
```

## Outputs

| Output | Description |
|--------|-------------|
| `app_id` | Amplify App ID |
| `default_domain` | Amplify default domain |
| `app_url` | Full URL to access the app |
| `deployment_mode` | "manual" or "git" |
| `manual_deploy_command` | Instructions for manual deployment |

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `aws_region` | AWS region | `us-east-1` |
| `environment` | Environment name | `dev` |
| `repository_url` | Git repo URL (empty = manual mode) | `""` |
| `branch_name` | Branch to deploy | `main` |
| `github_access_token` | Token for private repos | `""` |
| `cognito_user_pool_id` | From Cognito output | `""` |
| `cognito_user_pool_client_id` | From Cognito output | `""` |
| `cognito_identity_pool_id` | From Cognito output | `""` |
| `custom_domain` | Custom domain | `""` |

## Cleanup

```bash
terraform destroy
```
