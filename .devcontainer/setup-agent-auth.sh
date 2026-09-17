#!/usr/bin/env bash
# Agent authentication setup script
# Runs during post-create to automate GitHub, Azure DevOps, and Claude CLI authentication
# Supports both environment variables and interactive setup fallback

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔐 Setting up agent-based development authentication..."
echo ""

# Load .env if it exists (user-provided tokens)
ENV_FILE="${SCRIPT_DIR}/.env"
if [ -f "$ENV_FILE" ]; then
  echo "📦 Loading environment variables from .devcontainer/.env..."
  # Source without exiting on error (in case some vars are empty)
  set +e
  source "$ENV_FILE"
  set -e
fi

# ──── GitHub CLI Authentication ────────────────────────────────────────────────
setup_github() {
  echo ""
  echo "🐙 GitHub CLI Authentication"
  echo "────────────────────────────"
  
  if [ -n "${GH_TOKEN:-}" ]; then
    echo "  ✓ GH_TOKEN found in environment"
    echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null && echo "  ✓ GitHub CLI authenticated" || echo "  ⚠ GitHub authentication failed (non-critical)"
  else
    echo "  ℹ No GH_TOKEN in .env or environment"
    echo "  📋 To enable automation:"
    echo "     1. Create token: https://github.com/settings/tokens"
    echo "     2. Add GH_TOKEN to .devcontainer/.env"
    echo "     3. Restart devcontainer"
    echo ""
    
    # Only prompt if stdin is a TTY (interactive terminal)
    if [ -t 0 ]; then
      echo "  💡 Or authenticate now interactively (optional):"
      read -p "     Run 'gh auth login'? (y/n) " -n 1 -r || true
      echo ""
      if [[ ${REPLY:-} =~ ^[Yy]$ ]]; then
        gh auth login
      fi
    else
      echo "  💡 (Interactive auth skipped in non-interactive environment)"
    fi
  fi
}

# ──── Azure DevOps Authentication ──────────────────────────────────────────────
setup_azure() {
  echo ""
  echo "☁️  Azure DevOps (ADO) Authentication"
  echo "──────────────────────────────────────"
  
  if [ -n "${AZURE_DEVOPS_EXT_PAT:-}" ]; then
    echo "  ✓ AZURE_DEVOPS_EXT_PAT found in environment"
    echo "  ✓ Azure DevOps CLI configured"
  else
    echo "  ℹ No AZURE_DEVOPS_EXT_PAT in .env or environment"
    echo "  📋 To enable automation:"
    echo "     1. Create PAT: https://dev.azure.com/jpsfs/_usersSettings/tokens"
    echo "     2. Add AZURE_DEVOPS_EXT_PAT to .devcontainer/.env"
    echo "     3. Restart devcontainer"
    echo ""
    
    # Only prompt if stdin is a TTY (interactive terminal)
    if [ -t 0 ]; then
      echo "  💡 Or authenticate now interactively (optional):"
      read -p "     Run 'az login'? (y/n) " -n 1 -r || true
      echo ""
      if [[ ${REPLY:-} =~ ^[Yy]$ ]]; then
        az login
        az devops configure --defaults organization=https://dev.azure.com/jpsfs
      fi
    else
      echo "  💡 (Interactive auth skipped in non-interactive environment)"
    fi
  fi
}

# ──── Claude CLI + Azure DevOps MCP Setup ──────────────────────────────────────
setup_claude_mcp() {
  echo ""
  echo "🤖 Claude CLI + Azure DevOps MCP Setup"
  echo "────────────────────────────────────────"
  
  if ! command -v claude >/dev/null 2>&1; then
    echo "  ⚠ Claude code CLI not found"
    return 1
  fi
  
  # Create Claude CLI config directory
  CLAUDE_CONFIG_DIR="${HOME}/.config/claude-cli"
  mkdir -p "$CLAUDE_CONFIG_DIR"
  
  # Create/update Claude CLI config with MCP server for Azure DevOps
  CLAUDE_CONFIG="${CLAUDE_CONFIG_DIR}/config.json"
  
  # Check if config exists
  if [ ! -f "$CLAUDE_CONFIG" ]; then
    echo "  📝 Creating Claude CLI configuration with Azure DevOps MCP..."
    cat > "$CLAUDE_CONFIG" <<'EOF'
{
  "mcpServers": {
    "ado": {
      "command": "npx",
      "args": ["-y", "@azure-devops/mcp", "jpsfs"],
      "env": {
        "AZURE_DEVOPS_EXT_PAT": "$AZURE_DEVOPS_EXT_PAT"
      }
    }
  },
  "models": {
    "default": "claude-3-5-sonnet-20241022"
  }
}
EOF
    echo "  ✓ Claude CLI configured with ADO MCP at ~/.config/claude-cli/config.json"
  else
    echo "  ℹ Claude CLI config already exists at ~/.config/claude-cli/config.json"
  fi
  
  echo "  ✓ Claude CLI can now access Azure DevOps"
}

# ──── Git Configuration for Automation ────────────────────────────────────────
setup_git_automation() {
  echo ""
  echo "🌳 Git Configuration for Agent Automation"
  echo "─────────────────────────────────────────"
  
  # If GitHub is authenticated, use GitHub's default name
  if gh auth status >/dev/null 2>&1; then
    GH_USER=$(gh api user -q .login 2>/dev/null || echo "automation")
    GH_EMAIL=$(gh api user -q .email 2>/dev/null || echo "automation@redinfo.local")
    
    echo "  📧 Detected GitHub user: $GH_USER"
    git config --local user.name "$GH_USER" 2>/dev/null || true
    git config --local user.email "$GH_EMAIL" 2>/dev/null || true
  else
    echo "  ℹ Git user.name and user.email not auto-configured"
    echo "     Set manually: git config --local user.name \"Your Name\""
  fi
  
  echo "  ✓ Git ready for automated commits and PRs"
}

# ──── Main execution ────────────────────────────────────────────────────────────
setup_github
setup_azure
setup_claude_mcp
setup_git_automation

echo ""
echo "✅ Authentication setup complete!"
echo ""
echo "📌 Summary:"
echo "   • GitHub CLI: $(gh auth status >/dev/null 2>&1 && echo '✓ Authenticated' || echo '✗ Not authenticated')"
echo "   • Azure DevOps: $([ -n "${AZURE_DEVOPS_EXT_PAT:-}" ] && echo '✓ PAT available' || echo '✗ No PAT')"
echo "   • Claude CLI + MCP: ✓ Ready"
echo ""
echo "📖 For detailed setup: see .devcontainer/AUTHENTICATION.md"
echo "💡 Next: Start developing with 'pnpm dev' or explore with Copilot Chat!"
