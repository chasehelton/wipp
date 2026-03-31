# Wipp

AI coding assistant powered by the GitHub Copilot SDK, controlled via Discord, designed to run on a Raspberry Pi.

## Architecture

```
Discord → Wipp Daemon → Orchestrator (Opus 4.6) → Workers (Sonnet 4.6)
                              ↕                         ↕
                         GitHub MCP                Git Worktrees
                              ↕
                      SQLite (memory, tasks, config)
```

## Quick Start

```bash
# Clone the repo
git clone https://github.com/chasehelton/wipp.git ~/wipp
cd ~/wipp

# Run the setup script (installs Node.js, builds, configures systemd)
chmod +x deploy/setup.sh
./deploy/setup.sh

# Edit your environment variables
nano ~/.wipp/.env

# Start the service
systemctl --user start wipp
```

## Environment Variables

Configure in `~/.wipp/.env`:

| Variable | Required | Description |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Yes | Bot token from the Discord Developer Portal |
| `DISCORD_AUTHORIZED_USER_ID` | Yes | Your Discord user ID (only this user can issue commands) |
| `GITHUB_TOKEN` | Yes | GitHub PAT with `repo` scope |
| `COPILOT_ORCHESTRATOR_MODEL` | No | Model for the orchestrator (default: `claude-opus-4.6`) |
| `COPILOT_WORKER_MODEL` | No | Model for workers (default: `claude-sonnet-4.6`) |
| `SESSION_MAX_TURNS` | No | Max turns per session (default: `15`) |
| `WORKER_TIMEOUT` | No | Worker timeout in ms (default: `600000`) |
| `MAX_WORKERS` | No | Max concurrent workers (default: `2`) |
| `REPOS_DIR` | No | Directory for git repos (default: `~/repos`) |
| `LINEAR_API_KEY` | No | Linear Personal API Key — enables Linear integration |

## Discord Commands

| Command | Description |
|---|---|
| `/work <issue-url>` | Start working on a GitHub issue — creates a branch, worktree, and begins coding |
| `/status` | Show the current task queue and active workers |
| `/stop` | Cancel the current task |
| `/config` | View or update runtime configuration |

## Coding Workflow

When you send `/work <issue-url>`, wipp follows this flow:

1. **Parse** — Reads the GitHub issue title, body, and comments
2. **Branch** — Creates a feature branch from the default branch
3. **Worktree** — Sets up a git worktree for isolated work
4. **Plan** — The orchestrator (Opus 4.6) breaks the issue into subtasks
5. **Code** — Workers (Sonnet 4.6) implement each subtask using the Copilot SDK
6. **Verify** — Runs linting, type-checking, and tests
7. **PR** — Opens a pull request on GitHub with a summary of changes
8. **Report** — Sends the PR link back to Discord

All work happens in isolated worktrees, so the main repo stays clean.

## Linear Integration

If `LINEAR_API_KEY` is set, wipp can work with Linear issues and projects:

- **Read issues**: "What's on my Linear backlog?" or "Work on ENG-123"
- **Create issues/projects**: "Create a Linear issue for fixing the auth bug"
- **Auto-status sync**: When wipp starts work on a Linear issue, it moves the issue to "In Progress". When a PR is created, it moves it to "Done".

To set up, generate a Personal API Key at [linear.app/settings/api](https://linear.app/settings/api) and add it to `~/.wipp/.env`.

## Development

```bash
# Run in dev mode (auto-reload)
npm run dev

# Type-check without emitting
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## License

MIT
