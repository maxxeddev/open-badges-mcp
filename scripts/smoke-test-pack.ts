/**
 * Release smoke test — exercises the *published* package artifact, not the repo.
 *
 * Steps:
 *   1. Run `npm pack` to create a tarball (same artifact `npm publish` would ship).
 *   2. Install the tarball into a temporary directory.
 *   3. Start the MCP server from the installed package via stdio.
 *   4. Send a JSON-RPC `initialize` handshake followed by a `tools/call` for `list_classes`.
 *   5. Assert the response contains class data (no ENOENT, no crash).
 *   6. Clean up.
 *
 * This catches "works in dev, breaks in production" bugs where files are missing
 * from the npm tarball (e.g. data/sources.json not listed in package.json#files).
 */

import { execSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// Step 1: Pack
// ---------------------------------------------------------------------------
console.log("📦 Packing tarball...");
const packOutput = execSync("npm pack --json", { cwd: ROOT, encoding: "utf-8" });
const [packInfo] = JSON.parse(packOutput) as { filename: string }[];
const tarball = join(ROOT, packInfo.filename);
console.log(`   → ${packInfo.filename}`);

// ---------------------------------------------------------------------------
// Step 2: Install into temp dir
// ---------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "ob3-smoke-"));
console.log(`📂 Installing into ${tmp}...`);
execSync(`npm init -y`, { cwd: tmp, stdio: "ignore" });
execSync(`npm install "${tarball}"`, { cwd: tmp, stdio: "ignore" });

const entrypoint = join(tmp, "node_modules", "mcp-ob-ts", "dist", "cli.js");
const packageDataDir = join(tmp, "node_modules", "mcp-ob-ts", "data");

// ---------------------------------------------------------------------------
// Step 3: Start the server
// ---------------------------------------------------------------------------
console.log("🚀 Starting MCP server...");
const server = spawn("node", [entrypoint, "--data-dir", packageDataDir], {
  cwd: tmp,
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
server.stderr.on("data", (chunk: Buffer) => {
  stderr += chunk.toString();
});

server.on("error", (err) => {
  console.error("Server process error:", err.message);
});

server.on("exit", (code, signal) => {
  if (code !== null && code !== 0) {
    console.error(`Server exited with code ${code}`);
  }
  if (signal) {
    console.error(`Server killed with signal ${signal}`);
  }
});

// Helpers for JSON-RPC over stdio (newline-delimited JSON, per MCP SDK)
let responseBuffer = "";
let messageId = 0;

function sendRequest(method: string, params: Record<string, unknown> = {}): number {
  const id = ++messageId;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  server.stdin.write(`${msg}\n`);
  return id;
}

function sendNotification(method: string, params: Record<string, unknown> = {}): void {
  const msg = JSON.stringify({ jsonrpc: "2.0", method, params });
  server.stdin.write(`${msg}\n`);
}

function waitForResponse(expectedId: number, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for response id=${expectedId}.\nstderr: ${stderr}`));
    }, timeoutMs);

    function onData(chunk: Buffer) {
      responseBuffer += chunk.toString();

      // Parse newline-delimited JSON messages
      while (true) {
        const newlineIdx = responseBuffer.indexOf("\n");
        if (newlineIdx === -1) break;

        const line = responseBuffer.slice(0, newlineIdx).replace(/\r$/, "");
        responseBuffer = responseBuffer.slice(newlineIdx + 1);

        if (!line) continue;

        const parsed = JSON.parse(line);
        if (parsed.id === expectedId) {
          clearTimeout(timer);
          server.stdout.off("data", onData);
          resolve(parsed);
          return;
        }
      }
    }

    server.stdout.on("data", onData);
  });
}

// ---------------------------------------------------------------------------
// Step 4: Initialize + call tool
// ---------------------------------------------------------------------------
try {
  // Give server a moment to start
  await new Promise((r) => setTimeout(r, 1000));

  console.log("🤝 Sending initialize...");
  const initId = sendRequest("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0.0" },
  });
  const initResp = await waitForResponse(initId);
  if ("error" in initResp) {
    throw new Error(`Initialize failed: ${JSON.stringify(initResp.error)}`);
  }

  // Send initialized notification
  sendNotification("notifications/initialized");

  console.log("🔧 Calling list_classes...");
  const callId = sendRequest("tools/call", { name: "list_classes", arguments: {} });
  const callResp = await waitForResponse(callId);

  if ("error" in callResp) {
    throw new Error(`tools/call failed: ${JSON.stringify(callResp.error)}`);
  }

  const result = callResp.result as { content?: { text?: string }[] };
  const text = result?.content?.[0]?.text;
  if (!text) {
    throw new Error(`Unexpected response shape: ${JSON.stringify(callResp)}`);
  }

  const payload = JSON.parse(text);
  if (!Array.isArray(payload.classes) || payload.classes.length === 0) {
    throw new Error(`Expected non-empty classes array, got: ${text.slice(0, 200)}`);
  }

  console.log(`✅ Smoke test passed — received ${payload.classes.length} classes.`);
} catch (err) {
  console.error("❌ Smoke test FAILED:");
  console.error((err as Error).message);
  if (stderr) console.error("Server stderr:", stderr);
  process.exitCode = 1;
} finally {
  // ---------------------------------------------------------------------------
  // Step 6: Cleanup
  // ---------------------------------------------------------------------------
  server.kill();
  rmSync(tarball, { force: true });
  rmSync(tmp, { recursive: true, force: true });
}
