# Agent-Based Development Setup

This devcontainer is configured with comprehensive tools for highly automated, agent-based development on the redinfo repository.

## ⚡ Quick Start

**First time setup (before opening VS Code):**

```bash
# 1. Create tokens:
#    - GitHub: https://github.com/settings/tokens (repo, read:org, gist scopes)
#    - Azure DevOps: https://dev.azure.com/jpsfs/_usersSettings/tokens (Work Items Read & Write)

# 2. Copy and configure environment:
cp .devcontainer/.env.example .devcontainer/.env

# 3. Edit .devcontainer/.env with your tokens
nano .devcontainer/.env  # or open in your editor

# 4. Open VS Code - devcontainer will auto-authenticate!
code /path/to/redinfo
```

That's it! You're ready to use Claude, GitHub CLI, Azure DevOps, and agents without manual authentication.

## 📋 Installed Tools

### Claude Code CLI
- **Command**: `claude`
- **Purpose**: AI-powered code generation and analysis
- **Usage**: Invoke Claude to analyze code, generate solutions, or discuss implementation approaches

### GitHub CLI
- **Command**: `gh`
- **Purpose**: Automate GitHub operations (PRs, issues, repos, workflows)
- **Setup**: Run `gh auth login` on first use
- **Examples**:
  - `gh pr create --draft` - Create draft PR
  - `gh issue list` - List issues
  - `gh workflow run` - Trigger workflows

### Azure CLI
- **Command**: `az`
- **Purpose**: Manage Azure resources, interact with Azure DevOps
- **Setup**: Run `az login` on first use
- **See Also**: `.github/ADO_AUTH.md` for Azure DevOps PAT setup

### Automation Utilities
- **jq** - JSON query/processing for data manipulation
- **yq** - YAML processing for config editing
- **make** - Task automation via Makefile
- **curl, wget, gpg** - Download and verify tools

## 🚀 Agent-Based Workflows

### Example 1: Claude Code Analysis
```bash
# Let Claude analyze your codebase
claude analyze packages/backend/src/auth

# Generate implementation for a feature
claude generate "add password reset endpoint to auth module"
```

### Example 2: Automated PR Creation
```bash
# Create a branch and PR via agent automation
gh pr create --title "Feature: X" --body "Implementation of X feature"

# Check PR status
gh pr view
```

### Example 3: Repository Exploration via Agents
```bash
# VS Code Copilot Chat is available for interactive analysis
# Use @vscode workspace context for codebase questions
# Use @gh for GitHub operations via Copilot
```

### Example 4: Claude CLI with Azure DevOps MCP
```bash
# Use Claude CLI to interact with Azure DevOps
# The MCP server is automatically configured

# List ADO work items
claude "List all open work items in the redinfo project"

# Analyze sprint status (after authentication)
claude "What's the status of the current sprint?"

# Get issue details
claude "Show me details for work item 158"
```

### Example 5: Automated PR and Issue Management via Agents
```bash
# Create a branch and PR with Claude analysis
claude "Create a PR for the user authentication feature with proper testing"

# Have Claude review code against standards
claude "Review this code against our UI-UX-GUIDELINES and testing standards"
```

## 🔧 Development Workflow

### Build & Test
```bash
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm dev            # Start dev servers (backend + frontend)
```

### Database Operations
```bash
pnpm --filter backend prisma:generate    # Generate Prisma client
pnpm --filter backend prisma:migrate:dev # Create new migration
pnpm --filter backend prisma:studio      # Open Prisma Studio
```

### Code Quality
```bash
pnpm lint           # Run ESLint
pnpm format         # Format with Prettier
```

### Claude CLI + Azure DevOps MCP Integration

Once authenticated (via `.env` or interactive setup), Claude CLI automatically has access to the Azure DevOps MCP server:

```bash
# The MCP is configured at ~/.config/claude-cli/config.json
# Use the 'ado' server to query Azure DevOps

claude "List all open bugs in redinfo project"
claude "Who is assigned to work item 158?"
claude "Show me the sprint burndown"
```

The MCP server enables Claude to:
- Query work items and user stories
- Read project structure and areas
- Analyze sprints and iterations
- Access pipeline and build information

See [.github/ADO_AUTH.md](../.github/ADO_AUTH.md) for Azure DevOps PAT scopes.
- Safe directory: `/workspaces/redinfo`
- Default author: "Redinfo Automation" (configure as needed)
- Auto-fetch enabled for agent awareness

To update git config:
```bash
git config --local user.email "your-email@example.com"
git config --local user.name "Your Name"
```

## 🔐 Automated Authentication Setup

**👉 For detailed setup instructions, see [AUTHENTICATION.md](AUTHENTICATION.md)**

### Quick Setup

To work without manual authentication prompts, pre-configure tokens:

```bash
cp .devcontainer/.env.example .devcontainer/.env
# Edit .devcontainer/.env with your GitHub and Azure DevOps tokens
nano .devcontainer/.env

# Start VS Code - devcontainer auto-authenticates!
code /path/to/redinfo
```

**Before you start**: Create tokens at:
- GitHub: https://github.com/settings/tokens (repo, read:org, gist scopes)
- Azure DevOps: https://dev.azure.com/jpsfs/_usersSettings/tokens (Work Items Read & Write)

## 📖 Useful References

- **UI/UX Guidelines**: [.github/UI-UX-GUIDELINES.md](.github/UI-UX-GUIDELINES.md)
- **Testing Standards**: [.github/TESTING-STANDARD.md](.github/TESTING-STANDARD.md)
- **AI Governance**: [.github/AI-GOVERNANCE.md](.github/AI-GOVERNANCE.md)
- **PR Template**: [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)

## 💡 Agent Integration Tips

1. **Use VS Code Copilot Chat**:
   - Reference workspace files with `@vscode`
   - Ask about codebase patterns and architecture
   - Request implementation help for specific modules

2. **Leverage GitHub Context**:
   - Reference PR requirements via Copilot
   - Ask Claude to review code against standards
   - Use agents for cross-repository analysis

3. **Automate Repetitive Tasks**:
   - Create shell scripts in `scripts/`
   - Use Make for common operations
   - Chain CLI tools (gh, az, jq) for complex automation

4. **Monitor Agent Output**:
   - Always review generated code before merging
   - Validate against `.github/AI-GOVERNANCE.md` merge gates
   - Include screenshots for UI changes per PR template

## 🐛 Troubleshooting

### Authentication Issues
See [AUTHENTICATION.md](AUTHENTICATION.md#-troubleshooting) for detailed authentication troubleshooting.

### Claude CLI not found
```bash
which claude
# If not found, restart devcontainer or reinstall
```

### GitHub/Azure CLI authentication issues
```bash
gh auth logout && gh auth login
az logout && az login
```

### Database connection issues
```bash
# Check PostgreSQL is healthy
docker ps | grep postgres
# Restart PostgreSQL if needed
docker-compose restart postgres
```

## 📝 Next Steps

1. Authenticate with GitHub: `gh auth login`
2. Set up Azure DevOps: `az login` (or export PAT)
3. Configure git user info if needed
4. Start exploring with Claude or Copilot Chat
5. Run `pnpm dev` to start development servers

---

**Happy automated development! 🤖**
