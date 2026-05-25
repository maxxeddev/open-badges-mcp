export const name = "ping";
export const description = "Health check.";
export const inputSchema = {};

export async function handler() {
  return {
    content: [{ type: "text" as const, text: "pong" }],
  };
}
