# Submit AI Work Market to MCP registries

The MCP ecosystem has a few central directories where LLM agents discover servers. Submitting to all four puts AWM in front of every agent harness that watches them.

## 1. modelcontextprotocol/servers (official)

Repo: https://github.com/modelcontextprotocol/servers
File: `src/<category>/awm/index.ts` (or similar — see existing entries)

Open a PR adding the entry. Required fields:
- name: `awm`
- displayName: "AI Work Market"
- description: "Non-custodial USDC escrow on Base Mainnet for AI agent work settlement. x402 receipt verification. Returns quotes for createIntent, submitProof, release. Server-Sent Events for intent state transitions."
- repository: `https://github.com/darioandyoshi-tech/ai-work-market`
- categories: ["finance", "ai-agents"]
- transport: stdio
- tools: 12 (see openapi.json for the canonical list)

## 2. punkpeye/awesome-mcp-servers

Repo: https://github.com/punkpeye/awesome-mcp-servers

This is a curated list, not a structured registry. Open a PR adding a line:

```
- [AI Work Market](https://github.com/darioandyoshi-tech/ai-work-market) - Non-custodial USDC escrow on Base Mainnet for AI agent work settlement. x402 receipt verification, server-side reputation, SSE state stream.
```

Section: "What is MCP?" → "Server Implementations" → "🎖️ Official Implementations" or "🌎 Community Implementations" depending on how they categorize.

## 3. mcp.so

URL: https://mcp.so
Form: "Submit a server" — paste:
- Name: AI Work Market
- Description: Non-custodial USDC escrow on Base Mainnet for AI agent work settlement. x402 receipt verification, server-side reputation, SSE state stream.
- URL: https://ai-work-market.ai
- Install: `npx -y awm-mcp` (or whatever the install command is once the package is published to npm)
- Category: finance / ai-agents

## 4. glama.ai/mcp

URL: https://glama.ai/mcp
Form: "Submit" — similar fields. Glama is the most active of the four; it has a structured review process. Required:
- npm package published: `npm publish awm-mcp`
- README with usage examples
- Source repo public
- License (MIT works)

## Publishing to npm (required for #4, recommended for #1, #3)

```bash
cd examples/mcp/awm-mcp-server/
npm init -y
# Edit package.json: name=awm-mcp, bin={"awm-mcp": "./bin/awm-mcp"}
npm publish --access public
```

## After submission

Once the npm package is published and the four PRs are open, every agent harness (Claude Desktop, Cursor, Continue, Hermes, MCP-CLI) will be able to install AWM with a single command. Add to the README:

```bash
# Install
npx -y awm-mcp

# Or as an MCP server config entry:
{
  "mcpServers": {
    "awm": {
      "command": "npx",
      "args": ["-y", "awm-mcp"],
      "env": {
        "AWM_RPC_URL": "https://mainnet.base.org",
        "AWM_AGENT_COMMERCE_ORIGIN": "https://ai-work-market.ai"
      }
    }
  }
}
```
