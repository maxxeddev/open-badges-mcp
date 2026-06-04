import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as createAchievementCredential from "./create_achievement_credential.js";
import * as crossReference from "./cross_reference.js";
import * as findConformanceRequirements from "./find_conformance_requirements.js";
import * as generateCredential from "./generate_credential.js";
import * as getClass from "./get_class.js";
import * as getContext from "./get_context.js";
import * as getExamples from "./get_examples.js";
import * as getProperty from "./get_property.js";
import * as getSection from "./get_section.js";
import * as listClasses from "./list_classes.js";
import * as listProperties from "./list_properties.js";
import * as listSections from "./list_sections.js";
import * as ping from "./ping.js";
import * as resolveTerm from "./resolve_term.js";
import * as searchSpec from "./search_spec.js";
import * as validateCredential from "./validate_credential.js";

const tools = [
  ping,
  listClasses,
  getClass,
  listProperties,
  getProperty,
  getContext,
  resolveTerm,
  searchSpec,
  getSection,
  listSections,
  crossReference,
  getExamples,
  validateCredential,
  findConformanceRequirements,
  generateCredential,
  createAchievementCredential,
];

export function registerAll(server: McpServer): void {
  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.inputSchema, tool.handler);
  }
}
