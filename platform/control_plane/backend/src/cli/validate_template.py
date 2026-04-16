#!/usr/bin/env python3
"""
CLI tool for validating templates
"""

import sys
import json
import click
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.template_validator import TemplateValidator
from models.template import ValidationResult


@click.command()
@click.argument('template_path', type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option('--schema', type=click.Path(exists=True), help='Path to JSON schema file')
@click.option('--verbose', is_flag=True, help='Show detailed validation output')
@click.option('--json-output', 'json_output', is_flag=True, help='Output results as JSON')
def validate_template(template_path: str, schema: str, verbose: bool, json_output: bool):
    """
    Validate a template directory

    Validates template structure, metadata, and files according to
    Control Plane template specification.

    TEMPLATE_PATH: Path to template directory to validate

    Examples:

        # Validate template with default schema
        $ validate-template ./templates/my-template

        # Validate with custom schema
        $ validate-template ./templates/my-template --schema ./custom-schema.json

        # Get JSON output for CI/CD
        $ validate-template ./templates/my-template --json-output

    Exit Codes:
        0: Template is valid
        1: Template has errors
        2: Validation failed (exception)
    """
    try:
        # Initialize validator
        validator = TemplateValidator(schema_path=schema) if schema else TemplateValidator()

        # Run validation
        template_path_obj = Path(template_path)
        result = validator.validate_template(template_path_obj)

        # Output results
        if json_output:
            _output_json(result, template_path)
        else:
            _output_text(result, template_path, verbose)

        # Exit with appropriate code
        sys.exit(0 if result.valid else 1)

    except FileNotFoundError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(2)
    except Exception as e:
        click.echo(f"Validation failed: {e}", err=True)
        if verbose:
            import traceback
            traceback.print_exc()
        sys.exit(2)


def _output_text(result: ValidationResult, template_path: str, verbose: bool):
    """Output validation results as text"""
    click.echo(f"Validating template: {template_path}")
    click.echo("=" * 60)

    if result.valid:
        click.secho("✓ Template is valid", fg='green', bold=True)
    else:
        click.secho("✗ Template has errors", fg='red', bold=True)

    # Show errors
    if result.errors:
        click.echo()
        click.secho(f"Errors ({len(result.errors)}):", fg='red', bold=True)
        for i, error in enumerate(result.errors, 1):
            click.echo(f"  {i}. {error}")

    # Show warnings
    if result.warnings:
        click.echo()
        click.secho(f"Warnings ({len(result.warnings)}):", fg='yellow', bold=True)
        for i, warning in enumerate(result.warnings, 1):
            click.echo(f"  {i}. {warning}")

    # Summary
    if verbose or not result.valid:
        click.echo()
        click.echo("=" * 60)
        click.echo(f"Summary: {len(result.errors)} errors, {len(result.warnings)} warnings")


def _output_json(result: ValidationResult, template_path: str):
    """Output validation results as JSON"""
    output = {
        "template_path": str(template_path),
        "valid": result.valid,
        "errors": result.errors,
        "warnings": result.warnings,
        "error_count": len(result.errors),
        "warning_count": len(result.warnings)
    }
    click.echo(json.dumps(output, indent=2))


@click.group()
def cli():
    """Control Plane template validation tools"""
    pass


cli.add_command(validate_template, name='validate')


if __name__ == '__main__':
    cli()
