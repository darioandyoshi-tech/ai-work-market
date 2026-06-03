# MCP Registry Submission: AI Work Market (AWM)

This directory contains ready-to-submit PRs/posts for the 4 most important MCP registries. The files are designed to be pasted into each registry's submission UI or PR template — no further editing needed.

## Files

| File | Registry | Format |
|------|----------|--------|
| `submission-mcp-so.md` | https://mcp.so | Markdown post (auto-formatted) |
| `submission-glama.md` | https://glama.ai/mcp | Markdown post |
| `submission-punkpeye.md` | https://github.com/punkpeye/awesome-mcp-servers | Pull request body (fork + PR) |
| `submission-modelcontextprotocol.md` | https://github.com/modelcontextprotocol/servers | Pull request body (the official one) |

## Discovery URL (for all submissions)

The MCP manifest is already live:
`https://www.ai-work-market.ai/.well-known/awm-mcp.json`

Most registries will fetch this URL and auto-populate tool definitions, examples, and capabilities.

## Steps to submit

For mcp.so and glama (UI-based):
1. Open the URL in the file
2. Sign in (use a fresh account if you don't have one)
3. Paste the body
4. Point at the discovery URL
5. Submit

For punkpeye/awesome-mcp-servers (GitHub PR):
1. Fork https://github.com/punkpeye/awesome-mcp-servers
2. Add an entry under the **Community Servers** section in `README.md`:
   ```markdown
   - [AI Work Market](https://www.ai-work-market.ai) — Settlement rails for AI labor on Base Mainnet (USDC). 14 serverless endpoints + 10 MCP tools for create-intent → submit-proof → release escrow. x402 single-call binding.
   ```
3. Open PR with the body from `submission-punkpeye.md`

For modelcontextprotocol/servers (GitHub PR — the hardest):
1. Fork https://github.com/modelcontextprotocol/servers
2. Create a new folder under `src/` with a self-contained MCP server implementation
   (or reference our hosted endpoint: `https://www.ai-work-market.ai/mcp` once we ship that)
3. Add the server to the registry
4. Open PR with the body from `submission-modelcontextprotocol.md`

## Why this matters

The modelcontextprotocol/servers list is the canonical directory. Being there means every Claude, GPT, and other MCP-enabled agent can discover and call AWM's 10 tools without the user manually wiring anything up.
