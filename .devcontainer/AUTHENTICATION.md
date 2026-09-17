# Automated Authentication for Agent-Based Development

This guide explains how to set up fully automated authentication for your devcontainer so you can start working immediately without manual authentication steps.

## 🚀 Three-Step Setup

### Step 1: Create Authentication Tokens

#### GitHub Token
1. Visit: https://github.com/settings/tokens/new
2. Name: `redinfo-devcontainer`
3. Expiration: 90 days (or your preference)
4. Select scopes:
   - ✅ `repo` (full control of private repositories)
   - ✅ `read:org` (read organization data)
   - ✅ `gist` (create gists)
5. Generate and copy the token (starts with `ghp_`)

#### Azure DevOps Token
1. Visit: https://dev.azure.com/jpsfs/_usersSettings/tokens
2. Click **New Token**
3. Name: `redinfo-automation`
4. Organization: `jpsfs`
5. Expiration: 90 days (or your preference)
6. Select scopes:
   - ✅ **Work Items** (Read & Write)
   - ✅ **Code** (Read) - *if you need to access repos*
   - ✅ **Pipelines** (Read) - *if you need to check builds*
7. Create and copy the token

### Step 2: Configure Your Devcontainer

```bash
cd /path/to/redinfo

# Copy the environment template
cp .devcontainer/.env.example .devcontainer/.env

# Edit the file with your tokens
# Use any editor (nano, vim, VSCode, etc.)
nano .devcontainer/.env
```

Fill in your tokens:
```bash
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_DEVOPS_EXT_PAT=123456789012345678901234567890123456
```

**Security**: The `.devcontainer/.env` file is in `.gitignore` and won't be committed.

### Step 3: Start VS Code

```bash
code /path/to/redinfo
```

During devcontainer startup, you'll see:
```
🐙 GitHub CLI Authentication
   ✓ GH_TOKEN found in environment
   ✓ GitHub CLI authenticated

☁️  Azure DevOps (ADO) Authentication
   ✓ AZURE_DEVOPS_EXT_PAT found in environment
   ✓ Azure DevOps CLI configured

🤖 Claude CLI + Azure DevOps MCP Setup
   ✓ Claude CLI configured with ADO MCP at ~/.config/claude-cli/config.json
   ✓ Claude CLI can now access Azure DevOps via 'use @ado' command

🌳 Git Configuration for Agent Automation
   ✓ Git ready for automated commits and PRs
```

**You're ready!** No more manual authentication.

---

## 🤖 Using Claude CLI with Azure DevOps

Once authenticated, Claude CLI has full access to your Azure DevOps workspace:

```bash
# List open work items
claude "List all open work items in the redinfo project"

# Get sprint status
claude "Show me the current sprint status and burndown"

# Analyze a specific item
claude "What's the status of work item 158?"

# Get team info
claude "Who is on the redinfo team?"
```

Claude can read work items, understand requirements, and help implement features aligned with your sprint planning.

---

## ⚙️ Alternative: Interactive Authentication

If you skip the `.env` setup, the devcontainer will prompt you:

```
🐙 GitHub CLI Authentication
   ℹ No GH_TOKEN in .env or environment
   💡 Or authenticate now interactively (optional):
      Run 'gh auth login'? (y/n)
```

Respond `y` to authenticate interactively. This stores credentials in `~/.config/gh/` (GitHub CLI default).

---

## 🔄 Refreshing or Rotating Tokens

If your tokens expire or you need to rotate them:

1. **GitHub**: Generate a new token at https://github.com/settings/tokens/new
2. **Azure DevOps**: Generate a new PAT at https://dev.azure.com/jpsfs/_usersSettings/tokens
3. Update `.devcontainer/.env` with the new values
4. Restart the devcontainer: Close VS Code and reopen
5. The post-create script will re-authenticate automatically

---

## 🐛 Troubleshooting

### "GH_TOKEN found in environment" but GitHub CLI still prompts
- Make sure `GH_TOKEN` is valid and has the right scopes
- Try: `echo $GH_TOKEN` to verify the variable is set
- Manually authenticate: `gh auth logout && gh auth login`

### Claude CLI can't access Azure DevOps
- Ensure `AZURE_DEVOPS_EXT_PAT` is set
- Verify the token has "Work Items (Read & Write)" scope
- Check Claude config: `cat ~/.config/claude-cli/config.json`
- Try: `npx @azure-devops/mcp jpsfs` to test the MCP directly

### Git commits fail with "Author identity unknown"
- Run: `git config --local user.email "your@email.com"`
- Run: `git config --local user.name "Your Name"`
- These are auto-configured if GitHub auth works

---

## 📚 Related Documentation

- [.github/ADO_AUTH.md](../.github/ADO_AUTH.md) - Azure DevOps authentication details
- [.github/AI-GOVERNANCE.md](../.github/AI-GOVERNANCE.md) - AI merge gates and rules
- [AGENT_SETUP.md](AGENT_SETUP.md) - Full agent tools and examples
- GitHub CLI: https://cli.github.com/
- Azure CLI: https://learn.microsoft.com/en-us/cli/azure/

---

## ✅ Checklist for Full Automation

- [ ] GitHub token created and added to `.devcontainer/.env`
- [ ] Azure DevOps PAT created and added to `.devcontainer/.env`
- [ ] `.devcontainer/.env` file created (will be ignored by git)
- [ ] VS Code devcontainer started (authentication happens automatically)
- [ ] `gh auth status` shows authenticated
- [ ] `az devops` commands work without prompts
- [ ] `claude "show me work items"` returns results
- [ ] Ready to start agent-based development! 🚀

