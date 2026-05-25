import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAll } from "./tools/index.js";

const server = new McpServer({
  name: "ob3-spec",
  version: "0.1.0",
});

registerAll(server);

await server.connect(new StdioServerTransport());
