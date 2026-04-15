"""
Standalone integration test for IaC type filtering
Tests template filtering without requiring all backend dependencies
"""

from pathlib import Path


def test_template_structure():
    """Verify that template directories have all three IaC types"""
    print("\n=== Testing Template Structure ===")

    templates_dir = Path(__file__).parent.parent.parent / "templates"

    for template_name in ["langraph-agentcore", "strands-agentcore"]:
        template_path = templates_dir / template_name / "iac"

        print(f"\nChecking {template_name}:")

        # Check that all three IaC directories exist
        terraform_dir = template_path / "terraform"
        cdk_dir = template_path / "cdk"
        cfn_dir = template_path / "cloudformation"

        assert terraform_dir.exists(), f"Missing terraform directory in {template_name}"
        assert cdk_dir.exists(), f"Missing cdk directory in {template_name}"
        assert cfn_dir.exists(), f"Missing cloudformation directory in {template_name}"

        print(f"  ✓ All three IaC directories present")

        # Count files in each directory
        terraform_files = list(terraform_dir.rglob("*"))
        cdk_files = list(cdk_dir.rglob("*"))
        cfn_files = list(cfn_dir.rglob("*"))

        print(f"  ✓ Terraform: {len([f for f in terraform_files if f.is_file()])} files")
        print(f"  ✓ CDK: {len([f for f in cdk_files if f.is_file()])} files")
        print(f"  ✓ CloudFormation: {len([f for f in cfn_files if f.is_file()])} files")

    print(f"\n✅ Template structure test PASSED")
    return True


def test_terraform_files():
    """Verify Terraform directory has expected files"""
    print("\n=== Testing Terraform Files ===")

    templates_dir = Path(__file__).parent.parent.parent / "templates"
    terraform_dir = templates_dir / "langraph-agentcore" / "iac" / "terraform"

    # Expected files
    expected_files = ["main.tf", "variables.tf", "outputs.tf"]

    for expected in expected_files:
        file_path = terraform_dir / expected
        assert file_path.exists(), f"Missing {expected} in Terraform directory"
        print(f"  ✓ {expected} present")

    print(f"✅ Terraform files test PASSED")
    return True


def test_cdk_files():
    """Verify CDK directory has expected files"""
    print("\n=== Testing CDK Files ===")

    templates_dir = Path(__file__).parent.parent.parent / "templates"
    cdk_dir = templates_dir / "langraph-agentcore" / "iac" / "cdk"

    # Expected files and directories
    expected = {
        "files": ["package.json", "tsconfig.json", "cdk.json", ".gitignore", "README.md"],
        "dirs": ["bin", "lib"]
    }

    for file_name in expected["files"]:
        file_path = cdk_dir / file_name
        assert file_path.exists(), f"Missing {file_name} in CDK directory"
        print(f"  ✓ {file_name} present")

    for dir_name in expected["dirs"]:
        dir_path = cdk_dir / dir_name
        assert dir_path.exists(), f"Missing {dir_name}/ directory in CDK"
        print(f"  ✓ {dir_name}/ directory present")

    # Check for key TypeScript files
    app_ts = cdk_dir / "bin" / "app.ts"
    stack_ts = cdk_dir / "lib" / "agentcore-stack.ts"
    assert app_ts.exists(), "Missing bin/app.ts"
    assert stack_ts.exists(), "Missing lib/agentcore-stack.ts"
    print(f"  ✓ TypeScript files present (app.ts, agentcore-stack.ts)")

    print(f"✅ CDK files test PASSED")
    return True


def test_cloudformation_files():
    """Verify CloudFormation directory has expected files"""
    print("\n=== Testing CloudFormation Files ===")

    templates_dir = Path(__file__).parent.parent.parent / "templates"
    cfn_dir = templates_dir / "langraph-agentcore" / "iac" / "cloudformation"

    # Expected files
    expected_files = ["template.yaml", "README.md", ".gitignore"]

    for file_name in expected_files:
        file_path = cfn_dir / file_name
        assert file_path.exists(), f"Missing {file_name} in CloudFormation directory"
        print(f"  ✓ {file_name} present")

    # Verify template.yaml contains key CloudFormation elements
    template_yaml = cfn_dir / "template.yaml"
    content = template_yaml.read_text()

    assert "AWSTemplateFormatVersion" in content, "template.yaml missing AWSTemplateFormatVersion"
    assert "Parameters:" in content, "template.yaml missing Parameters section"
    assert "Resources:" in content, "template.yaml missing Resources section"
    assert "Outputs:" in content, "template.yaml missing Outputs section"
    print(f"  ✓ template.yaml structure valid")

    print(f"✅ CloudFormation files test PASSED")
    return True


def test_no_cross_contamination():
    """Verify that IaC directories don't contain files from other types"""
    print("\n=== Testing No Cross-Contamination ===")

    templates_dir = Path(__file__).parent.parent.parent / "templates"
    template_path = templates_dir / "langraph-agentcore" / "iac"

    # Terraform should not have .ts or .yaml IaC files
    terraform_dir = template_path / "terraform"
    tf_files = [f.name for f in terraform_dir.rglob("*") if f.is_file()]
    assert not any(f.endswith(".ts") for f in tf_files if "node_modules" not in str(f)), \
        "Terraform directory contains TypeScript files"
    assert not any(f == "cdk.json" for f in tf_files), "Terraform directory contains CDK files"
    print(f"  ✓ Terraform directory clean (no CDK/CFN files)")

    # CDK should not have .tf or template.yaml files
    cdk_dir = template_path / "cdk"
    cdk_files = [f.name for f in cdk_dir.rglob("*") if f.is_file()]
    assert not any(f.endswith(".tf") for f in cdk_files), "CDK directory contains Terraform files"
    assert "template.yaml" not in cdk_files, "CDK directory contains CloudFormation files"
    print(f"  ✓ CDK directory clean (no Terraform/CFN files)")

    # CloudFormation should not have .tf or .ts files
    cfn_dir = template_path / "cloudformation"
    cfn_files = [f.name for f in cfn_dir.rglob("*") if f.is_file()]
    assert not any(f.endswith(".tf") for f in cfn_files), "CloudFormation directory contains Terraform files"
    assert not any(f.endswith(".ts") for f in cfn_files if f != "README.md"), \
        "CloudFormation directory contains TypeScript files"
    assert "cdk.json" not in cfn_files, "CloudFormation directory contains CDK files"
    print(f"  ✓ CloudFormation directory clean (no Terraform/CDK files)")

    print(f"✅ No cross-contamination test PASSED")
    return True


def test_variable_placeholders():
    """Verify that templates contain variable placeholders"""
    print("\n=== Testing Variable Placeholders ===")

    templates_dir = Path(__file__).parent.parent.parent / "templates"

    # Check Terraform
    tf_main = templates_dir / "langraph-agentcore" / "iac" / "terraform" / "main.tf"
    tf_content = tf_main.read_text()
    assert "${PROJECT_NAME}" in tf_content, "Terraform missing PROJECT_NAME placeholder"
    print(f"  ✓ Terraform has variable placeholders")

    # Check CDK
    cdk_app = templates_dir / "langraph-agentcore" / "iac" / "cdk" / "bin" / "app.ts"
    cdk_content = cdk_app.read_text()
    assert "PROJECT_NAME" in cdk_content, "CDK missing PROJECT_NAME reference"
    print(f"  ✓ CDK has variable placeholders")

    # Check CloudFormation
    cfn_template = templates_dir / "langraph-agentcore" / "iac" / "cloudformation" / "template.yaml"
    cfn_content = cfn_template.read_text()
    assert "${PROJECT_NAME}" in cfn_content, "CloudFormation missing PROJECT_NAME placeholder"
    print(f"  ✓ CloudFormation has variable placeholders")

    print(f"✅ Variable placeholders test PASSED")
    return True


def run_all_tests():
    """Run all standalone tests"""
    print("=" * 60)
    print("IaC Template Structure Tests (Standalone)")
    print("=" * 60)

    tests = [
        test_template_structure,
        test_terraform_files,
        test_cdk_files,
        test_cloudformation_files,
        test_no_cross_contamination,
        test_variable_placeholders,
    ]

    passed = 0
    failed = 0

    for test in tests:
        try:
            if test():
                passed += 1
        except AssertionError as e:
            failed += 1
            print(f"\n❌ {test.__name__} FAILED: {e}")
        except Exception as e:
            failed += 1
            print(f"\n❌ {test.__name__} ERROR: {e}")

    print("\n" + "=" * 60)
    print(f"Test Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return failed == 0


if __name__ == "__main__":
    import sys
    success = run_all_tests()
    sys.exit(0 if success else 1)
