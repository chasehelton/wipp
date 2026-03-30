---
name: find-skills
description: Search and install skills from the skills.sh community registry
---

# Finding and Installing Skills

You can search for community skills on skills.sh to extend your capabilities.

## Searching
Use the `search_skills` tool to query the skills.sh registry:
- Search by capability: "database management", "react testing", "docker"
- Search by language: "python", "rust", "go"

## Evaluating Results
Each skill has security audit scores from three sources:
- **Gen Agent Trust Hub**: Community trust rating
- **Socket**: Supply chain security analysis
- **Snyk**: Vulnerability scanning

Prefer skills with HIGH scores from all three. Be cautious with LOW or UNKNOWN scores.

## Installing
Use the `install_skill` tool. ALWAYS:
1. Show the user the skill name, description, and security scores
2. Ask for explicit confirmation before installing
3. Never install skills with known security vulnerabilities

Example interaction:
> Found `database-expert` skill (Security: ✅ High / ✅ High / ⚠️ Medium)
> Description: Expert knowledge for PostgreSQL, MySQL, and SQLite queries
> 423 installs
> 
> Install this skill?

## Uninstalling
Use the `uninstall_skill` tool with the skill slug. Only user-installed skills can be removed — bundled skills are part of wipp.
