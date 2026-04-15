-- Migration: Add iac_type column to projects table
-- Phase 2: IaC Variety Support
-- Date: 2026-03-16

-- Add iac_type column with default value 'terraform'
ALTER TABLE projects
ADD COLUMN iac_type VARCHAR(50) NOT NULL DEFAULT 'terraform';

-- Add check constraint for valid values
ALTER TABLE projects
ADD CONSTRAINT iac_type_check CHECK (iac_type IN ('terraform', 'cdk', 'cloudformation'));

-- Add index for efficient filtering
CREATE INDEX idx_projects_iac_type ON projects(iac_type);

-- Update existing rows to have terraform as iac_type (already set by default)
-- No action needed as default value handles this

-- Rollback script (to be run manually if needed):
-- ALTER TABLE projects DROP CONSTRAINT iac_type_check;
-- DROP INDEX idx_projects_iac_type;
-- ALTER TABLE projects DROP COLUMN iac_type;
