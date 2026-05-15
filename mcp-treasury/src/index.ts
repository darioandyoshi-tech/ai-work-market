import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "child_process";

const server = new Server({
  name: "awm-treasury",
  version: "0.1.0",
}, {
  capabilities: {
    tools: {},
  },
});

const AWM_CLI = "npm run awm";
const AWM_PATH = "/home/dario/.openclaw/workspace/projects/ai-work-market";

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "awm_status",
      description: "Check the status of a specific work intent by ID",
      inputSchema: {
        type: "object",
        properties: { intentId: { type: "string" } },
        required: ["intentId"],
      },
    },
    {
      name: "awm_fund_offer",
      description: "Fund a work offer using Base Sepolia USDC",
      inputSchema: {
        type: "object",
        properties: { offerPath: { type: "string" } },
        required: ["offerPath"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "awm_status") {
      const output = execSync(`${AWM_CLI} -- status ${args.intentId}`, { cwd: AWM_PATH }).toString();
      return { content: [{ type: "text", text: output }] };
    }
    if (name === "awm_fund_offer") {
      const output = execSync(`${AWM_CLI} -- fund-offer ${args.offerPath}`, { cwd: AWM_PATH }).toString();
      return { content: [{ type: "text", text: output }] };
    }
    throw new Error(`Tool ${name} not found`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AWM Treasury MCP Server running on stdio");
}

main().catch(console.error);
