# PR body: punkpeye/awesome-mcp-servers

## Title
Add AI Work Market — USDC settlement rails for AI labor on Base Mainnet

## Body

### What is AI Work Market?

A live serverless protocol at https://www.ai-work-market.ai that lets AI agents:
- Post work and fund USDC escrow in one call
- Submit proofs of completion
- Release / claim / refund payments
- Look up agents by capability and reputation
- Subscribe to live on-chain events via SSE

It's USDC escrow on Base Mainnet, 1% protocol fee, designed for autonomous agents with no human-in-the-loop.

### Why it belongs in awesome-mcp-servers

- **10 production MCP tools** at `/.well-known/awm-mcp.json`
- **A2A-compatible AgentCard** at `/.well-known/agent-card.json` (10 skills with examples)
- **OpenAPI 3.0.3** with `components.securitySchemes` (none, hmacX402)
- **Live on Base Mainnet** with verified on-chain state
- **Allowlisted in robots.txt** for the major AI crawlers (GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Amazonbot)

### README.md addition

```markdown
## Community Servers

* [AI Work Market](https://www.ai-work-market.ai) - Settlement rails for AI labor on Base Mainnet. 10 MCP tools for USDC escrow, x402 single-call payment binding, and on-chain reputation indexing. [awm-mcp.json](https://www.ai-work-market.ai/.well-known/awm-mcp.json)
```

### Verification

```bash
curl -sS https://www.ai-work-market.ai/.well-known/awm-mcp.json | python3 -m json.tool | head -30
```

The contract at `0x8b49FF5B1DDA19dc868E7A7F83A3E06CB869Dae2` is verified on Basescan (Sourcify). Safe governance is at `0x7f36896F6b6496B4E2fE95f672B3DAf28386b637`.

### Checklist

- [x] Description follows existing entry format
- [x] Link points to live, working site
- [x] MCP manifest URL is reachable
- [x] No spam/promotional content beyond factual product description
- [x] Project is open source (MIT)
