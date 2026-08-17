import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAll } from "./tools/index.js";

// Report the real package version to clients rather than a hardcoded literal,
// which had drifted to 0.1.0 while the package shipped 0.3.x.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const server = new McpServer({
  name: "ob3-spec",
  version,
});

registerAll(server);

await server.connect(new StdioServerTransport());
