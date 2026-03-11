# Contributing to FSI Agent Kit

Thank you for your interest in contributing to the FSI Agent Kit!

## Repository Access

**🌟 This is a public open-source repository - contributions are welcome!**

- **Anyone can contribute** by forking and creating pull requests
- All contributions must be **reviewed and approved** before merge
- Follow the guidelines below to ensure smooth collaboration

## Contribution Process

### 1. Before You Start

- Review existing issues and PRs to avoid duplicates
- For major changes, open an issue first to discuss with @vivibui
- Read the documentation to understand the project structure

### 2. Making Changes

**Fork and Branch:**
```bash
# 1. Fork the repository on GitHub (click "Fork" button)

# 2. Clone YOUR fork
git clone https://github.com/YOUR_USERNAME/sample-aws-fsi-agent-kit.git
cd sample-aws-fsi-agent-kit

# 3. Add upstream remote to stay in sync
git remote add upstream https://github.com/aws-samples/sample-aws-fsi-agent-kit.git

# 4. Create a feature branch
git checkout -b feature/my-feature-name

# 5. Keep your fork updated
git fetch upstream
git rebase upstream/main
```

**Make Your Changes:**
- Follow the existing code style and conventions
- Write clear, descriptive commit messages
- Add tests for new functionality
- Update documentation as needed

**Test Your Changes:**
```bash
# Run tests locally
pytest tests/

# Test deployment (if applicable)
# (follow instructions in relevant README)
```

### 3. Submitting a Pull Request

```bash
# 1. Commit your changes
git add .
git commit -m "feat: add new feature description"

# 2. Push to YOUR fork
git push origin feature/my-feature-name
```

**On GitHub:**
1. Go to **your fork** on GitHub
2. Click "Compare & pull request" (or "New Pull Request")
3. **Base repository**: `aws-samples/sample-aws-fsi-agent-kit` base: `main`
4. **Head repository**: `YOUR_USERNAME/sample-aws-fsi-agent-kit` compare: `feature/my-feature-name`
5. Fill out the PR template completely
6. Click "Create Pull Request"

### 4. Code Review Process

**Required Approval:**
- **ALL pull requests require approval from @vivibui**
- No direct pushes to `main` branch are allowed
- No CI/CD checks required (manual review only)

**Review Timeline:**
- Initial review typically within 2-3 business days
- Feedback will be provided via PR comments
- Address feedback and push updates to your branch

**Merging:**
- PRs are merged by @vivibui only
- Squash and merge is preferred to keep history clean
- After merge, your branch will be automatically deleted

## Branch Protection Rules

The `main` branch is protected with the following rules:

- ✅ Require pull request before merging
- ✅ Require 1 approval from @vivibui
- ✅ Dismiss stale reviews when new commits are pushed
- ✅ Require status checks to pass before merge
- ✅ Require conversation resolution before merge
- ❌ No direct pushes to `main` (including admins)
- ✅ Require linear history (squash merge)

## Code Style Guidelines

### Python
- Follow PEP 8
- [Optional] Use `black` for formatting
- [Optional] Use `flake8` for linting
- Type hints preferred for public APIs

### Terraform
- Follow HashiCorp style guide
- [Optional] Use `terraform fmt`
- Include variable descriptions
- Document module usage in README

### Documentation
- Use clear, concise language
- Include examples where applicable
- Update README files when adding features
- Keep documentation in sync with code

## Testing Requirements

All contributions must include appropriate tests:

- **Unit Tests**: For individual functions and classes
- **Integration Tests**: For component interactions
- **Property-Based Tests**: For complex logic (where applicable)
- **Documentation**: For public APIs

## Commit Message Format

Use conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(control-plane): add template composition engine

Implements Phase 5 composition system to replace pre-built templates
with modular components. Reduces template count from 36 to 12.

Closes #123
```

## Getting Help

- **For bugs**: Open an issue with reproduction steps
- **For feature requests**: Open an issue to discuss with @vivibui
- **For questions**: Open a GitHub Discussion
- **For security issues**: See [SECURITY.md](../SECURITY.md)

## Recognition

Contributors will be recognized in:
- GitHub contributors page
- Release notes (for significant contributions)
- CONTRIBUTORS.md file

## Code of Conduct

- Be respectful and professional
- Focus on constructive feedback
- Help others learn and grow
- Follow GitHub Community Guidelines

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.

---

Thank you for contributing to FSI Agent Kit! 🚀
