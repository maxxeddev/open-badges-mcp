import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: "esm",
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Keep all runtime deps external — they're in package.json "dependencies"
  // and will be installed by npm/pnpm. sql.js in particular needs its WASM
  // binary resolved from node_modules at runtime.
  external: [
    "sql.js",
    "n3",
    "jsonld",
    "cheerio",
    "ajv",
    "ajv-formats",
    "zod",
    "@modelcontextprotocol/sdk",
  ],
});
