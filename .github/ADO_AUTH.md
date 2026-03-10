# Azure DevOps (ADO) authentication for MCP and CLI

This file documents non-interactive authentication for the Azure DevOps MCP server and related CLI usage. Store secrets in a secure vault (GitHub Secrets, Azure Key Vault) and avoid committing tokens.

Recommended approach

1. Create a Personal Access Token (PAT) for your `jpsfs` organization.
   - Go to: https://dev.azure.com/jpsfs/_usersSettings/tokens
   - Click **New Token** and set a short expiry.
   - Grant the least-privilege scopes needed for the automation you run (for MCP operations you will typically need **Work Items (Read & Write)**; add **Code** or **Pipelines** scopes only if your automation requires them).

2. Local usage (developer machine)

Export the PAT into an environment variable used by Azure DevOps CLI and many tools:

```bash
export AZURE_DEVOPS_EXT_PAT="<your-personal-access-token>"
```

Alternatively, log in interactively via Azure CLI and configure defaults (interactive):

```bash
az login
az devops configure --defaults organization=https://dev.azure.com/jpsfs
```

3. CI usage (GitHub Actions)

- Add a repository secret named `AZURE_DEVOPS_EXT_PAT` and set the PAT value.
- GitHub Actions steps or workflows that run `npx @azure-devops/mcp` will automatically pick up the variable if exported in the job environment.

Example (in your workflow):

```yaml
env:
  AZURE_DEVOPS_EXT_PAT: ${{ secrets.AZURE_DEVOPS_EXT_PAT }}
```

4. Best practices

- Grant the PAT only the scopes required and set a short expiration.
- Rotate PATs regularly and store them in a secret manager.
- Prefer service principals / managed identities when available for long-running automation.

Where this repo wires the MCP server

- VS Code MCP server: `.vscode/mcp.json` (default org set to `jpsfs`).
- CLI convenience script: run `pnpm ado:mcp` to start MCP for the `jpsfs` organization.
