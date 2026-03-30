---
name: wipp-coding
description: Coding conventions and workflow for wipp coding assistants
---

# Wipp Coding Conventions

When working on code as a wipp worker, follow these conventions:

## Commit Messages
Use conventional commits format:
- `feat: add user authentication`
- `fix: resolve login timeout on slow networks`  
- `refactor: extract validation logic into shared module`
- `docs: update API endpoint documentation`
- `test: add integration tests for payment flow`
- `chore: update dependencies`

## Branch Naming
Branches created by wipp follow the pattern: `wipp/{issue-slug}`
Examples:
- `wipp/issue-12-fix-login`
- `wipp/add-dark-mode`
- `wipp/refactor-auth-module`

## Before Pushing
1. Run the project's test suite if it exists
2. Run the project's linter if it exists
3. Ensure no TypeScript/compilation errors
4. Review your own changes for obvious issues

## Pull Request Template
When creating PRs, include:
- **What**: Brief description of changes
- **Why**: Link to issue or explain motivation
- **How**: Key implementation decisions
- **Testing**: What was tested and how

## Code Style
- Follow the existing code style of the repository
- Don't introduce new dependencies without good reason
- Prefer modifying existing abstractions over creating new ones
- Keep changes minimal and surgical
