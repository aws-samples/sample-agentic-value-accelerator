"""
Integration tests for IaC type filtering in template generation
Tests that TemplateService correctly filters template files by IaC type
"""

import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from services.template_service import TemplateService


def test_terraform_filtering():
    """Test that only Terraform files are included when iac_type='terraform'"""
    print("\n=== Testing Terraform Filtering ===")

    # Use relative path from backend/tests to templates
    service = TemplateService("../templates")
    files = service.load_template("langraph-agentcore", iac_type="terraform")

    # Check that Terraform files are present
    terraform_files = [f for f in files.keys() if f.startswith("iac/terraform/")]
    assert len(terraform_files) > 0, "No Terraform files found"
    print(f"✓ Found {len(terraform_files)} Terraform files")

    # Check that CDK files are NOT present
    cdk_files = [f for f in files.keys() if f.startswith("iac/cdk/")]
    assert len(cdk_files) == 0, f"Found {len(cdk_files)} CDK files (should be 0)"
    print(f"✓ No CDK files present")

    # Check that CloudFormation files are NOT present
    cfn_files = [f for f in files.keys() if f.startswith("iac/cloudformation/")]
    assert len(cfn_files) == 0, f"Found {len(cfn_files)} CloudFormation files (should be 0)"
    print(f"✓ No CloudFormation files present")

    # Verify common template files are still present
    assert any("requirements.txt" in f for f in files.keys()), "requirements.txt missing"
    assert any("Dockerfile" in f for f in files.keys()), "Dockerfile missing"
    assert any("README.md" in f for f in files.keys()), "README.md missing"
    print(f"✓ Common template files present")

    print(f"✅ Terraform filtering test PASSED ({len(files)} total files)")
    return True


def test_cdk_filtering():
    """Test that only CDK files are included when iac_type='cdk'"""
    print("\n=== Testing CDK Filtering ===")

    service = TemplateService("../templates")
    files = service.load_template("langraph-agentcore", iac_type="cdk")

    # Check that CDK files are present
    cdk_files = [f for f in files.keys() if f.startswith("iac/cdk/")]
    assert len(cdk_files) > 0, "No CDK files found"
    print(f"✓ Found {len(cdk_files)} CDK files")

    # Check that Terraform files are NOT present
    terraform_files = [f for f in files.keys() if f.startswith("iac/terraform/")]
    assert len(terraform_files) == 0, f"Found {len(terraform_files)} Terraform files (should be 0)"
    print(f"✓ No Terraform files present")

    # Check that CloudFormation files are NOT present
    cfn_files = [f for f in files.keys() if f.startswith("iac/cloudformation/")]
    assert len(cfn_files) == 0, f"Found {len(cfn_files)} CloudFormation files (should be 0)"
    print(f"✓ No CloudFormation files present")

    # Verify CDK-specific files
    cdk_file_names = [Path(f).name for f in cdk_files]
    assert "package.json" in cdk_file_names, "package.json missing"
    assert "tsconfig.json" in cdk_file_names, "tsconfig.json missing"
    assert "cdk.json" in cdk_file_names, "cdk.json missing"
    print(f"✓ CDK-specific files present (package.json, tsconfig.json, cdk.json)")

    print(f"✅ CDK filtering test PASSED ({len(files)} total files)")
    return True


def test_cloudformation_filtering():
    """Test that only CloudFormation files are included when iac_type='cloudformation'"""
    print("\n=== Testing CloudFormation Filtering ===")

    service = TemplateService("../templates")
    files = service.load_template("langraph-agentcore", iac_type="cloudformation")

    # Check that CloudFormation files are present
    cfn_files = [f for f in files.keys() if f.startswith("iac/cloudformation/")]
    assert len(cfn_files) > 0, "No CloudFormation files found"
    print(f"✓ Found {len(cfn_files)} CloudFormation files")

    # Check that Terraform files are NOT present
    terraform_files = [f for f in files.keys() if f.startswith("iac/terraform/")]
    assert len(terraform_files) == 0, f"Found {len(terraform_files)} Terraform files (should be 0)"
    print(f"✓ No Terraform files present")

    # Check that CDK files are NOT present
    cdk_files = [f for f in files.keys() if f.startswith("iac/cdk/")]
    assert len(cdk_files) == 0, f"Found {len(cdk_files)} CDK files (should be 0)"
    print(f"✓ No CDK files present")

    # Verify CloudFormation-specific files
    cfn_file_names = [Path(f).name for f in cfn_files]
    assert "template.yaml" in cfn_file_names, "template.yaml missing"
    print(f"✓ CloudFormation template.yaml present")

    print(f"✅ CloudFormation filtering test PASSED ({len(files)} total files)")
    return True


def test_both_templates():
    """Test that filtering works for both langraph and strands templates"""
    print("\n=== Testing Both Templates ===")

    service = TemplateService("../templates")

    for template_name in ["langraph-agentcore", "strands-agentcore"]:
        print(f"\nTesting {template_name}:")

        for iac_type in ["terraform", "cdk", "cloudformation"]:
            files = service.load_template(template_name, iac_type=iac_type)

            # Check that only the selected IaC type is present
            terraform_count = len([f for f in files.keys() if f.startswith("iac/terraform/")])
            cdk_count = len([f for f in files.keys() if f.startswith("iac/cdk/")])
            cfn_count = len([f for f in files.keys() if f.startswith("iac/cloudformation/")])

            if iac_type == "terraform":
                assert terraform_count > 0 and cdk_count == 0 and cfn_count == 0
            elif iac_type == "cdk":
                assert cdk_count > 0 and terraform_count == 0 and cfn_count == 0
            elif iac_type == "cloudformation":
                assert cfn_count > 0 and terraform_count == 0 and cdk_count == 0

            print(f"  ✓ {iac_type}: {len(files)} files (filtering correct)")

    print(f"\n✅ Both templates test PASSED")
    return True


def test_invalid_iac_type():
    """Test that invalid IaC type raises ValueError"""
    print("\n=== Testing Invalid IaC Type ===")

    service = TemplateService("../templates")

    try:
        files = service.load_template("langraph-agentcore", iac_type="invalid")
        assert False, "Should have raised ValueError for invalid IaC type"
    except ValueError as e:
        print(f"✓ ValueError raised as expected: {e}")

    print(f"✅ Invalid IaC type test PASSED")
    return True


def test_file_counts():
    """Test that file counts are reasonable for each IaC type"""
    print("\n=== Testing File Counts ===")

    service = TemplateService("../templates")

    for iac_type in ["terraform", "cdk", "cloudformation"]:
        files = service.load_template("langraph-agentcore", iac_type=iac_type)

        # Get IaC-specific file count
        iac_files = [f for f in files.keys() if f.startswith(f"iac/{iac_type}/")]

        # Minimum expected files per IaC type
        min_expected = {
            "terraform": 3,  # main.tf, variables.tf, outputs.tf, etc.
            "cdk": 5,        # bin/, lib/, package.json, tsconfig.json, cdk.json
            "cloudformation": 2  # template.yaml, README.md
        }

        assert len(iac_files) >= min_expected[iac_type], \
            f"{iac_type} has only {len(iac_files)} files (expected >= {min_expected[iac_type]})"

        print(f"✓ {iac_type}: {len(iac_files)} IaC files, {len(files)} total files")

    print(f"✅ File counts test PASSED")
    return True


def run_all_tests():
    """Run all integration tests"""
    print("=" * 60)
    print("IaC Type Filtering Integration Tests")
    print("=" * 60)

    tests = [
        test_terraform_filtering,
        test_cdk_filtering,
        test_cloudformation_filtering,
        test_both_templates,
        test_invalid_iac_type,
        test_file_counts,
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
    success = run_all_tests()
    sys.exit(0 if success else 1)
