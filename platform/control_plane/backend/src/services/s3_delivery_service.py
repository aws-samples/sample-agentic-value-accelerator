"""S3 delivery service — packages and uploads templates to S3"""

import boto3
import json
import os
import logging
from pathlib import Path
from typing import Dict, Any

from services.substitution_service import SubstitutionService
from services.zip_service import ZipService

logger = logging.getLogger(__name__)


class S3DeliveryService:
    def __init__(self, region: str = "us-east-1"):
        self.s3 = boto3.client("s3", region_name=region)
        self.substitution = SubstitutionService()
        self.zipper = ZipService()

    def _read_template_files(self, template_path: str, iac_path: str) -> Dict[str, bytes]:
        """Read template files into memory, filtering to selected IaC only."""
        files = {}
        src = Path(template_path)
        iac_dir = src / iac_path  # e.g., iac/terraform

        for root, dirs, filenames in os.walk(src):
            # Skip hidden dirs, __pycache__, node_modules
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("__pycache__", "node_modules")]

            rel_root = Path(root).relative_to(src)

            # If we're inside iac/, only include the selected subdirectory
            if str(rel_root).startswith("iac"):
                if not str(src / rel_root).startswith(str(iac_dir)):
                    continue

            for fname in filenames:
                if fname.startswith("."):
                    continue
                full = Path(root) / fname
                rel = str(rel_root / fname)
                files[rel] = full.read_bytes()

        return files

    def _generate_tfvars(self, files: Dict[str, bytes], parameters: Dict[str, Any], iac_path: str) -> Dict[str, bytes]:
        """Generate a terraform.auto.tfvars.json alongside the Terraform files.

        This ensures all deployment parameters are available as Terraform variables,
        so CodeBuild doesn't need to generate tfvars from environment variables.
        """
        # Find the IaC directory prefix in the file paths
        tf_dirs = set()
        for fpath in files:
            if fpath.endswith(".tf"):
                tf_dirs.add(str(Path(fpath).parent))

        tfvars_content = json.dumps(parameters, indent=2).encode("utf-8")

        # Always place tfvars at root for custom deploy.sh scripts
        files["deploy.auto.tfvars.json"] = tfvars_content
        logger.info(f"Generated root deploy.auto.tfvars.json with {len(parameters)} parameters")

        if not tf_dirs:
            return files

        # Also place tfvars in each Terraform directory found
        for tf_dir in tf_dirs:
            # Only place at the root IaC level, not inside nested modules
            if "modules/" in tf_dir:
                continue
            tfvars_path = f"{tf_dir}/deploy.auto.tfvars.json" if tf_dir != "." else "deploy.auto.tfvars.json"
            files[tfvars_path] = tfvars_content
            logger.info(f"Generated {tfvars_path} with {len(parameters)} parameters")

        return files

    def deliver_template(
        self,
        template_path: str,
        template_id: str,
        deployment_id: str,
        iac_path: str,
        parameters: Dict[str, Any],
        s3_bucket: str,
    ) -> str:
        """Package template with selected IaC and upload to S3. Returns s3_key."""
        # Read files
        files = self._read_template_files(template_path, iac_path)

        # Substitute parameters (converts keys to uppercase for ${VAR} pattern)
        upper_params = {k.upper(): str(v) for k, v in parameters.items()}
        files = self.substitution.substitute_variables(files, upper_params)

        # Generate terraform.auto.tfvars.json so CodeBuild passes params to Terraform
        files = self._generate_tfvars(files, parameters, iac_path)

        # Zip
        zip_bytes = self.zipper.create_zip(files)

        # Upload
        s3_key = f"deployments/{deployment_id}/{template_id}.zip"
        self.s3.put_object(Bucket=s3_bucket, Key=s3_key, Body=zip_bytes)
        logger.info(f"Uploaded to s3://{s3_bucket}/{s3_key}")
        return s3_key
