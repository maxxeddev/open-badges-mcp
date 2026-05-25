import { describe, expect, it } from "vitest";
import * as ping from "../src/tools/ping.js";

describe("ping tool", () => {
  it('has name "ping"', () => {
    expect(ping.name).toBe("ping");
  });

  it('has description "Health check."', () => {
    expect(ping.description).toBe("Health check.");
  });

  it("accepts no input parameters (empty inputSchema)", () => {
    expect(ping.inputSchema).toEqual({});
  });

  it('handler returns content with "pong" text', async () => {
    const result = await ping.handler();

    expect(result).toHaveProperty("content");
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content).toContainEqual({
      type: "text",
      text: "pong",
    });
  });
});
