#!/usr/bin/env python3
"""
Seed CodeCommit with FSI Foundry Use Case Templates

This script:
1. Discovers all FSI Foundry use case templates
2. Creates a CodeCommit repository for each use case
3. Commits the template source code to the repo
4. Creates branches for different deployment patterns (Terraform, CDK, etc.)
5. Tags releases (v1.0, v1.1, etc.)

Usage:
  # One-time setup
  python seed-codecommit-templates.py --mode init

  # Update existing repos (daily sync)
  python seed-codecommit-templates.py --mode sync

  # Dry run (preview changes)
  python seed-codecommit-templates.py --mode init --dry-run
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional

import boto3

# Configuration
REPO_ROOT = Path(__file__).parent.parent.parent.parent.parent
TEMPLATES_BASE_DIR = REPO_ROOT / "applications" / "reference_implementations"
FSI_FOUNDRY_USE_CASES_DIR = REPO_ROOT / "applications" / "fsi_foundry" / "use_cases"
FSI_FOUNDRY_REGISTRY = REPO_ROOT / "applications" / "fsi_foundry" / "data" / "registry" / "offerings.json"
CODECOMMIT_REPO_PREFIX_REFIMPL = "fsi-foundry-use-case"
CODECOMMIT_REPO_PREFIX_FOUNDRY = "fsi-foundry"
DEFAULT_BRANCH = "main"
REPO_DESCRIPTION_TEMPLATE = "FSI Foundry Use Case: {name} - Auto-synced from template catalog"


class CodeCommitSeeder:
    def __init__(self, dry_run: bool = False, region: str = "us-east-1"):
        self.dry_run = dry_run
        self.region = region
        self.codecommit = boto3.client("codecommit", region_name=region)
        self.sts = boto3.client("sts", region_name=region)
        self.account_id = self.sts.get_caller_identity()["Account"]

    def discover_templates(self) -> List[Dict]:
        """Discover all FSI Foundry use case templates from both sources."""
        templates = []

        # Source 1: reference_implementations/ (with template.json)
        print(f"🔍 Scanning reference implementations in: {TEMPLATES_BASE_DIR}")
        if TEMPLATES_BASE_DIR.exists():
            for template_dir in TEMPLATES_BASE_DIR.iterdir():
                if not template_dir.is_dir():
                    continue

                template_json = template_dir / "template.json"
                if not template_json.exists():
                    continue

                with open(template_json) as f:
                    template = json.load(f)

                template["_path"] = template_dir
                template["_source"] = "reference_implementations"
                templates.append(template)
                print(f"  ✓ Found: {template['id']} ({template.get('name', 'Unnamed')})")

        # Source 2: fsi_foundry/use_cases/ (from offerings.json registry)
        print(f"\n🔍 Scanning FSI Foundry use cases in: {FSI_FOUNDRY_USE_CASES_DIR}")
        if FSI_FOUNDRY_REGISTRY.exists():
            with open(FSI_FOUNDRY_REGISTRY) as f:
                registry = json.load(f)

            for uc in registry.get("use_cases", []):
                uc_path = REPO_ROOT / uc["application_path"]
                if not uc_path.exists():
                    print(f"  ⚠️  Skipping {uc['use_case_name']}: path not found")
                    continue

                template = {
                    "id": uc["use_case_name"],
                    "name": uc["name"],
                    "description": uc.get("description", ""),
                    "type": "fsi_foundry_use_case",
                    "frameworks": [{"id": fw, "path": "."} for fw in uc.get("supported_frameworks", [])],
                    "deployment_patterns": [{"id": p, "path": "."} for p in uc.get("supported_patterns", [])],
                    "parameters": [],
                    "_path": uc_path,
                    "_source": "fsi_foundry",
                    "_registry_id": uc["id"],
                }
                templates.append(template)
                print(f"  ✓ Found: {uc['id']} {uc['use_case_name']} ({uc['name']})")

        print(f"\n📦 Total templates found: {len(templates)}\n")
        return templates

    def get_repo_name(self, template: Dict) -> str:
        """Generate CodeCommit repository name for a template."""
        if isinstance(template, dict):
            source = template.get("_source", "reference_implementations")
            template_id = template["id"]
        else:
            # Backward compat: string passed
            source = "reference_implementations"
            template_id = template

        if source == "fsi_foundry":
            return f"{CODECOMMIT_REPO_PREFIX_FOUNDRY}-{template_id}"
        return f"{CODECOMMIT_REPO_PREFIX_REFIMPL}-{template_id}"

    def repo_exists(self, repo_name: str) -> bool:
        """Check if CodeCommit repository already exists."""
        try:
            self.codecommit.get_repository(repositoryName=repo_name)
            return True
        except self.codecommit.exceptions.RepositoryDoesNotExistException:
            return False

    def create_repository(self, template: Dict) -> str:
        """Create CodeCommit repository for a template."""
        repo_name = self.get_repo_name(template)
        description = REPO_DESCRIPTION_TEMPLATE.format(
            name=template.get("name", template["id"])
        )

        if self.dry_run:
            print(f"  [DRY RUN] Would create repository: {repo_name}")
            return f"arn:aws:codecommit:{self.region}:{self.account_id}:{repo_name}"

        if self.repo_exists(repo_name):
            print(f"  ⏭️  Repository already exists: {repo_name}")
            repo = self.codecommit.get_repository(repositoryName=repo_name)
            return repo["repositoryMetadata"]["Arn"]

        print(f"  🏗️  Creating repository: {repo_name}")
        response = self.codecommit.create_repository(
            repositoryName=repo_name,
            repositoryDescription=description,
            tags={
                "ManagedBy": "fsi-foundry-control-plane",
                "TemplateId": template["id"],
                "AutoSync": "true"
            }
        )

        return response["repositoryMetadata"]["Arn"]

    def commit_template_to_repo(self, template: Dict, branch: str = DEFAULT_BRANCH):
        """Commit template source code to CodeCommit repository."""
        repo_name = self.get_repo_name(template)
        template_path = template["_path"]

        if self.dry_run:
            print(f"  [DRY RUN] Would commit template to {repo_name}:{branch}")
            return

        print(f"  📝 Committing template to {repo_name}:{branch}")

        # Create temporary git workspace
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)

            # Initialize git repo
            subprocess.run(["git", "init"], cwd=tmpdir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "control-plane@fsi-foundry.aws"], cwd=tmpdir, check=True)
            subprocess.run(["git", "config", "user.name", "FSI Foundry Control Plane"], cwd=tmpdir, check=True)

            # Configure CodeCommit credential helper
            subprocess.run([
                "git", "config", "credential.helper",
                f"!aws codecommit credential-helper $@"
            ], cwd=tmpdir, check=True)
            subprocess.run([
                "git", "config", "credential.UseHttpPath", "true"
            ], cwd=tmpdir, check=True)

            # Copy template files — layout depends on source type.
            if template.get("_source") == "fsi_foundry":
                # FSI Foundry use cases only hold src/. Mirror the S3 bundle:
                # root = agentcore IaC (infra/, runtime/, ui/), plus shared/,
                # docker/, app_src/, use_cases/<name>/src, data/samples.
                use_case_name = template["id"]
                pattern = (template.get("deployment_patterns") or [{"id": "agentcore"}])[0]["id"]
                fsi_foundry_root = REPO_ROOT / "applications" / "fsi_foundry"
                iac_pattern_dir = fsi_foundry_root / "foundations" / "iac" / pattern
                shared_dir = fsi_foundry_root / "foundations" / "iac" / "shared"
                docker_dir = fsi_foundry_root / "foundations" / "docker"
                app_src_dir = fsi_foundry_root / "foundations" / "src"
                uc_src_dir = template_path / "src"
                data_samples_dir = fsi_foundry_root / "data" / "samples"
                ui_react_dir = fsi_foundry_root / "ui" / use_case_name

                print(f"    📁 Packaging FSI Foundry bundle (pattern={pattern}) for {use_case_name}")

                ignore = shutil.ignore_patterns(
                    "__pycache__", "node_modules", ".terraform",
                    "terraform.tfstate*", ".terraform.lock.hcl",
                )

                # 1. IaC (infra/, runtime/) flattened at root.
                #    The pattern dir's ui/ is the Terraform UI module — rename
                #    to ui_iac/ so it doesn't collide with the React UI that
                #    lives at ui/<use_case>/.
                if iac_pattern_dir.is_dir():
                    for item in iac_pattern_dir.iterdir():
                        if item.name in (".terraform", "terraform.tfstate.d"):
                            continue
                        dst_name = "ui_iac" if item.name == "ui" else item.name
                        dst = tmpdir_path / dst_name
                        if item.is_dir():
                            shutil.copytree(item, dst, ignore=ignore)
                        else:
                            shutil.copy2(item, dst)

                # 2. shared/
                if shared_dir.is_dir():
                    shutil.copytree(shared_dir, tmpdir_path / "shared", ignore=ignore)

                # 3. docker/
                if docker_dir.is_dir():
                    shutil.copytree(docker_dir, tmpdir_path / "docker", ignore=ignore)

                # 4. app_src/
                if app_src_dir.is_dir():
                    shutil.copytree(app_src_dir, tmpdir_path / "app_src", ignore=ignore)

                # 5. use_cases/<name>/src
                if uc_src_dir.is_dir():
                    dst = tmpdir_path / "use_cases" / use_case_name / "src"
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copytree(uc_src_dir, dst, ignore=ignore)

                # 6. data/samples
                if data_samples_dir.is_dir():
                    (tmpdir_path / "data").mkdir(exist_ok=True)
                    shutil.copytree(data_samples_dir, tmpdir_path / "data" / "samples", ignore=ignore)

                # 7. ui/<use_case>/ — React UI (if this use case has one)
                if ui_react_dir.is_dir():
                    (tmpdir_path / "ui").mkdir(exist_ok=True)
                    shutil.copytree(ui_react_dir, tmpdir_path / "ui" / use_case_name, ignore=ignore)

                # 7. template.json metadata (synthesized)
                (tmpdir_path / "template.json").write_text(json.dumps({
                    "id": template["id"],
                    "name": template.get("name"),
                    "description": template.get("description"),
                    "type": template.get("type"),
                    "frameworks": template.get("frameworks", []),
                    "deployment_patterns": template.get("deployment_patterns", []),
                    "_source": "fsi_foundry",
                    "_registry_id": template.get("_registry_id"),
                }, indent=2))
            else:
                # reference_implementations: copy directory contents as-is
                print(f"    📁 Copying template files from {template_path}")
                for item in template_path.iterdir():
                    if item.name in [".git", "__pycache__", "node_modules", ".terraform"]:
                        continue

                    if item.is_file():
                        shutil.copy2(item, tmpdir_path / item.name)
                    elif item.is_dir():
                        shutil.copytree(item, tmpdir_path / item.name,
                                      ignore=shutil.ignore_patterns("__pycache__", "node_modules", ".terraform"))

            # Create README.md with deployment instructions
            readme_content = self._generate_readme(template)
            (tmpdir_path / "README.md").write_text(readme_content)

            # Create .gitignore
            gitignore_content = """
__pycache__/
*.pyc
node_modules/
.terraform/
*.tfstate
*.tfstate.*
.env
.DS_Store
"""
            (tmpdir_path / ".gitignore").write_text(gitignore_content.strip())

            # Commit files
            subprocess.run(["git", "add", "."], cwd=tmpdir, check=True)
            subprocess.run([
                "git", "commit", "-m",
                f"Initial commit: {template.get('name', template['id'])}\n\nAuto-synced from template catalog"
            ], cwd=tmpdir, check=True)

            # Get CodeCommit clone URL
            repo_info = self.codecommit.get_repository(repositoryName=repo_name)
            clone_url = repo_info["repositoryMetadata"]["cloneUrlHttp"]

            # Push to CodeCommit
            try:
                # Try to fetch existing branch
                subprocess.run([
                    "git", "remote", "add", "origin", clone_url
                ], cwd=tmpdir, check=True, capture_output=True)

                # Try to fetch - if fails, repo is empty
                result = subprocess.run([
                    "git", "fetch", "origin", branch
                ], cwd=tmpdir, capture_output=True)

                if result.returncode == 0:
                    # Branch exists - merge or force push
                    print(f"    🔄 Branch {branch} exists, updating...")
                    subprocess.run([
                        "git", "push", "origin", f"HEAD:refs/heads/{branch}", "--force"
                    ], cwd=tmpdir, check=True)
                else:
                    # First commit to empty repo
                    print(f"    🆕 Creating branch {branch}...")
                    subprocess.run([
                        "git", "push", "-u", "origin", f"HEAD:refs/heads/{branch}"
                    ], cwd=tmpdir, check=True)

                    # Set default branch
                    self.codecommit.update_default_branch(
                        repositoryName=repo_name,
                        defaultBranchName=branch
                    )
            except subprocess.CalledProcessError as e:
                print(f"    ❌ Failed to push to CodeCommit: {e}")
                raise

    def _generate_readme(self, template: Dict) -> str:
        """Generate README.md for the CodeCommit repository."""
        name = template.get("name", template["id"])
        description = template.get("description", "FSI Foundry Use Case")
        template_id = template["id"]
        template_type = template.get("type", "reference")
        repo_name = self.get_repo_name(template)
        timestamp = self._get_timestamp()

        frameworks = template.get("frameworks", [])
        deployment_patterns = template.get("deployment_patterns", [])
        parameters = template.get("parameters", [])

        readme = f"""# {name}

{description}

## Overview

This repository contains the FSI Foundry use case: **{name}**.

**Template ID**: `{template_id}`
**Type**: `{template_type}`

## Supported Frameworks

"""

        for fw in frameworks:
            readme += f"- **{fw['id']}**: `{fw.get('path', '.')}`\n"

        readme += "\n## Deployment Patterns\n\n"

        for pattern in deployment_patterns:
            readme += f"- **{pattern['id']}**: `{pattern.get('path', '.')}`\n"

        if parameters:
            readme += "\n## Required Parameters\n\n"
            for param in parameters:
                required = "✓" if param.get("required") else "○"
                readme += f"- {required} **{param['name']}**: {param.get('description', 'No description')}\n"

        readme += f"""

## Deployment Options

### Option 1: Deploy from Control Plane UI

1. Go to FSI Foundry Control Plane frontend
2. Select "Deploy from Git (Advanced)"
3. Choose this repository
4. Select branch and deployment pattern
5. Click "Deploy"

### Option 2: Deploy Locally

```bash
# Clone repository
git clone https://git-codecommit.{self.region}.amazonaws.com/v1/repos/{repo_name}
cd {repo_name}

# Configure parameters (Terraform example)
cat > terraform.auto.tfvars.json <<EOF
{{
  "project_name": "my-project",
  "aws_region": "{self.region}"
}}
EOF

# Deploy infrastructure
cd infra
terraform init
terraform apply

# Deploy runtime
cd ../runtime
terraform init
terraform apply
```

### Option 3: Automatic Deployment via Git Push

Push to `main` or `develop` branch to trigger automatic deployment:

```bash
git checkout -b feature/my-changes
# Make changes...
git add .
git commit -m "feat: add custom feature"
git push origin feature/my-changes

# Create PR to main -> deployment triggered on merge
```

## Repository Structure

```
{template_id}/
├── template.json          # Template metadata
├── infra/                 # Infrastructure IaC
├── runtime/               # Runtime configuration
├── shared/                # Shared modules
├── app_src/               # Application source code
├── docker/                # Docker build context
├── ui/                    # Frontend UI (if applicable)
└── data/                  # Sample data
```

## Version Control

This repository is automatically synced from the FSI Foundry template catalog.

- **Branch**: `main` - Stable release
- **Branch**: `develop` - Latest features
- **Tags**: Version releases (v1.0.0, v1.1.0, etc.)

To create a custom fork:

```bash
# Fork this repo in CodeCommit console, then:
git clone https://git-codecommit.{self.region}.amazonaws.com/v1/repos/{repo_name}-custom
# Make your changes and deploy from your fork
```

## Support

For issues or questions, refer to the FSI Foundry documentation or contact the platform team.

---

*Auto-generated by FSI Foundry Control Plane*
*Last synced: {timestamp}*
"""
        return readme

    def _get_timestamp(self) -> str:
        """Get current timestamp for README."""
        from datetime import datetime
        return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    def create_branches_for_patterns(self, template: Dict):
        """Create branches for different deployment patterns."""
        deployment_patterns = template.get("deployment_patterns", [])

        if len(deployment_patterns) <= 1:
            # Single pattern, no need for branches
            return

        print(f"  🌳 Creating branches for deployment patterns...")

        for pattern in deployment_patterns:
            branch_name = f"pattern/{pattern['id']}"

            if self.dry_run:
                print(f"    [DRY RUN] Would create branch: {branch_name}")
                continue

            # For simplicity, all patterns share the same source
            # Users can customize per branch after seeding
            print(f"    📌 Branch {branch_name} will be created on next sync")

    def seed_all_templates(self, mode: str = "init"):
        """Seed all templates to CodeCommit."""
        templates = self.discover_templates()

        if not templates:
            print("❌ No templates found!")
            return

        print(f"🚀 Starting CodeCommit seeding in {mode} mode...\n")

        for i, template in enumerate(templates, 1):
            print(f"[{i}/{len(templates)}] Processing: {template['id']}")

            try:
                # Create repository
                repo_arn = self.create_repository(template)

                # Commit template source
                self.commit_template_to_repo(template)

                # Create branches for patterns
                if mode == "init":
                    self.create_branches_for_patterns(template)

                print(f"  ✅ Completed: {template['id']}\n")

            except Exception as e:
                print(f"  ❌ Failed: {template['id']} - {e}\n")
                if not self.dry_run:
                    raise

        print("=" * 60)
        print("✅ CodeCommit seeding completed!")
        print("=" * 60)
        print(f"\n📊 Summary:")
        print(f"  - Templates processed: {len(templates)}")
        print(f"  - Region: {self.region}")
        print(f"  - Account: {self.account_id}")
        print(f"\n🔗 View repositories:")
        print(f"  https://{self.region}.console.aws.amazon.com/codesuite/codecommit/repositories")


def main():
    parser = argparse.ArgumentParser(
        description="Seed CodeCommit with FSI Foundry use case templates"
    )
    parser.add_argument(
        "--mode",
        choices=["init", "sync"],
        default="init",
        help="init: First-time setup | sync: Update existing repos"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without making them"
    )
    parser.add_argument(
        "--region",
        default="us-east-1",
        help="AWS region for CodeCommit repositories"
    )

    args = parser.parse_args()

    seeder = CodeCommitSeeder(dry_run=args.dry_run, region=args.region)
    seeder.seed_all_templates(mode=args.mode)


if __name__ == "__main__":
    main()
