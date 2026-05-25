import { describe, expect, it } from "vitest";
import * as getClass from "../src/tools/get_class.js";
import * as listClasses from "../src/tools/list_classes.js";
import * as listProperties from "../src/tools/list_properties.js";
import * as ping from "../src/tools/ping.js";

/**
 * Property 7: Tool module interface contract
 *
 * For any module in `src/tools/`, the module SHALL export `name` (string),
 * `description` (string), `inputSchema` (object), and `handler` (function).
 *
 * **Validates: Requirements 8.2**
 */

// All tool modules that are registered with the server.
// When a new tool is added, it should be imported here as well.
const toolModules = [ping, listClasses, getClass, listProperties];

describe("Property 7: Tool module interface contract", () => {
  it.each(
    toolModules.map((m) => [m.name, m]),
  )('tool "%s" exports name (string), description (string), inputSchema (object), handler (function)', (_name, mod) => {
    expect(mod).toHaveProperty("name");
    expect(typeof mod.name).toBe("string");
    expect(mod.name.length).toBeGreaterThan(0);

    expect(mod).toHaveProperty("description");
    expect(typeof mod.description).toBe("string");
    expect(mod.description.length).toBeGreaterThan(0);

    expect(mod).toHaveProperty("inputSchema");
    expect(typeof mod.inputSchema).toBe("object");
    expect(mod.inputSchema).not.toBeNull();

    expect(mod).toHaveProperty("handler");
    expect(typeof mod.handler).toBe("function");
  });
});
