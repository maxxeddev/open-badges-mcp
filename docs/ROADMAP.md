# OB3 MCP Server — Build Roadmap

A staged plan for building a local MCP server that exposes the Open Badges 3.0 specification to a coding agent. Stage 0 sets up the project. Every stage after that ends with a runnable server you can connect to with the MCP Inspector and demo end-to-end.

Use one git commit per stage. Each stage is intentionally small so a regression is obvious and rollback is cheap.

**Stack:** Node 20+, TypeScript, `@modelcontextprotocol/sdk`, `n3` for Turtle, `jsonld` for JSON-LD work, `better-sqlite3` for FTS once we need it, `ajv` for JSON Schema validation. Package manager: `pnpm` is assumed below, but `npm` and `yarn` work identically.

---

## Stage 0 — Project init

**Goal:** working TypeScript project, no server yet. Last stage without a runnable server.

**Add:**

- `package.json` via `pnpm init`. Set `"type": "module"`.
- `tsconfig.json` targeting `ES2022`, `moduleResolution: "Bundler"`, `strict: true`, `outDir: "dist"`, `rootDir: "src"`.
- `.gitignore` with `node_modules/`, `dist/`, `data/cache/`, `.env`.
- `.nvmrc` containing `20`.
- `src/` directory with an empty `src/server.ts` placeholder.
- `data/` directory committed empty (snapshotted spec data will live here).
- `README.md` stub.

**Install:**

```bash
pnpm add @modelcontextprotocol/sdk zod
pnpm add -D typescript tsx vitest @types/node
```

**Scripts in `package.json`:**

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "inspect": "npx @modelcontextprotocol/inspector tsx src/server.ts"
  }
}
```

**Verify:** `pnpm build` exits cleanly with an empty `src/server.ts` (`export {}` is fine).

**Commit:** `chore: init typescript mcp project`

---

## Stage 1 — Minimal MCP server with one tool

**Goal:** a server that speaks MCP over stdio and exposes a single `ping` tool. Proves the whole toolchain works before any spec parsing.

**Files:**

- `src/server.ts` — creates the server, registers `ping`, connects to stdio.
- `src/tools/ping.ts` — the tool handler returning `{ ok: true, time: new Date().toISOString() }`.

**Key code (sketch):**

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "ob3-spec", version: "0.1.0" });

server.tool("ping", "Health check.", {}, async () => ({
  content: [{ type: "text", text: "pong" }],
}));

await server.connect(new StdioServerTransport());
```

**Verify:**

```bash
pnpm inspect
```

The MCP Inspector opens in a browser, lists `ping` under Tools, and calling it returns `pong`.

**Commit:** `feat: minimal mcp server with ping tool`

---

## Stage 2 — Snapshot the vocab and expose `list_classes`

**Goal:** ingest `vocab.ttl` once at startup, parse it into an in-memory graph, expose a single `list_classes` tool. From this stage on the server is genuinely useful.

**Install:**

```bash
pnpm add n3
```

**Files:**

- `scripts/fetch-spec-data.ts` — downloads canonical artifacts into `data/snapshots/<version>/`:
  - `vocab.ttl` from `https://purl.imsglobal.org/spec/vc/ob/vocab.ttl`
  - `vocab.html` (we'll use this in later stages for descriptions if needed)
  - Writes a `data/snapshots/<version>/manifest.json` recording source URLs, fetch date, and version string.
- `src/vocab/loader.ts` — parses `vocab.ttl` with `n3.Parser` into a `Store`, builds two maps: `classesByName: Map<string, ClassRecord>` and `propertiesByName: Map<string, PropertyRecord>`. Returns a `Vocab` object the server holds in module scope.
- `src/tools/list_classes.ts` — `{ classes: Array<{ name, description, subClassOf }> }`.

**Add a script entry:**

```json
"data:fetch": "tsx scripts/fetch-spec-data.ts"
```

**Run once:**

```bash
pnpm data:fetch
```

Then start the server with `pnpm inspect`.

**Verify:** Inspector → `list_classes` → returns ~28 entries including `AchievementCredential`, `Achievement`, `Profile`, `AchievementSubject`.

**Commit:** `feat: vocab snapshot + list_classes tool`

---

## Stage 3 — `get_class`

**Goal:** the highest-value tool in the whole project. Returns a class's full structured definition: description, `subClassOf`, every property with its range and contextual description.

**Files:**

- `src/vocab/index.ts` — exports `getClass(name): ClassRecord` joining classes ↔ properties. Critically: when a property has a union domain and per-class descriptions (look at how `name` is described differently on `Achievement` vs `AchievementCredential`), surface the class-specific description.
- `src/tools/get_class.ts` — input `{ name: string }`, output the structured record plus a `sources` array with the canonical vocab URL and anchor (e.g., `https://purl.imsglobal.org/spec/vc/ob/vocab.html#AchievementCredential`).
- `tests/vocab.test.ts` — vitest test asserting:
  - `getClass("AchievementCredential").subClassOf` includes `VerifiableCredential`.
  - Its `properties` list includes `name`, `description`, `image`, `awardedDate`, `credentialSubject`, `endorsement`, `endorsementJwt`, `evidence`.
  - The `name` property's description on `AchievementCredential` differs from its description on `Achievement`.

**Verify:**

```bash
pnpm test
pnpm inspect
```

In the Inspector, call `get_class` with `{"name": "AchievementCredential"}` and confirm the response matches the test expectations.

**Commit:** `feat: get_class tool with contextual property descriptions`

---

## Stage 4 — `list_properties` and `get_property`

**Goal:** complete the vocab core. These are cheap derivations of the indexes you already built.

**Files:**

- `src/tools/list_properties.ts` — input `{ class_name: string, required_only?: boolean }`. (Cardinality / `required` markers aren't in the .ttl in a uniform way for OB3; you may need to parse them from the HTML class boxes or the JSON Schema as a follow-up. Until then, `required_only` returns the same list with a TODO note in the response and a `caveat` field. Wire the parameter through now so you don't break consumers later.)
- `src/tools/get_property.ts` — input `{ name: string, on_class?: string }`. When `on_class` is provided and the property has a union domain, return only the matching domain entry plus that class's contextual description. When omitted, return all domains.

**Tests:**

- `get_property("alignment")` returns 4 domain entries (Achievement, Result, ResultDescription, RubricCriterionLevel) with distinct descriptions.
- `get_property("alignment", "Result")` returns one entry with the Result-specific description.
- `list_properties("Profile")` includes `address`, `parentOrg`, `email`, etc.

**Verify:** `pnpm test` passes; tools callable in Inspector.

**Commit:** `feat: list_properties + get_property tools`

---

## Stage 5 — JSON-LD context and term resolution

**Goal:** turn the JSON-LD context file into queryable data. Small stage, high agent value when debugging real credentials.

**Update `scripts/fetch-spec-data.ts`** to also download:

- `context-3.0.3.json` from the canonical purl
- `context-3.0.json` (the version-less redirect, captured under whatever it currently points to)

**Files:**

- `src/context/loader.ts` — loads the context JSON, builds `termToIri: Map<string, string>` and `iriToTerm: Map<string, string>`. Stores the raw context alongside.
- `src/tools/get_context.ts` — input `{ version?: string }`, output the structured term ↔ IRI table plus the raw context for clients that want it.
- `src/tools/resolve_term.ts` — input `{ term_or_iri: string }`, bidirectional lookup; returns `{ kind: "term" | "iri", term, iri, definedIn: "ob" | "vc" | "schema" | "other" }`.

**Verify:** `resolve_term({ term_or_iri: "achievement" })` returns the matching IRI. `resolve_term({ term_or_iri: "https://www.w3.org/2018/credentials#credentialSubject" })` resolves back to `credentialSubject` and notes it's a VC term, not an OB term.

**Commit:** `feat: get_context + resolve_term tools`

---

## Stage 6 — Spec prose ingestion + `search_spec`

**Goal:** start indexing prose (not just vocab). Introduces SQLite + FTS5. From here on, prose lookups are fast and rankable.

**Install:**

```bash
pnpm add better-sqlite3 cheerio
pnpm add -D @types/better-sqlite3
```

**Update `scripts/fetch-spec-data.ts`** to also download:

- The OB3 spec HTML (`https://www.imsglobal.org/spec/ob/v3p0/`)
- The W3C VC Data Model v2 HTML (secondary corpus)

**Files:**

- `scripts/ingest-spec.ts` — parses each spec HTML with cheerio, walks `<section>` elements, captures section IDs and titles, splits into chunks of ~800 tokens, writes rows to `data/index.db`:
  - Table `sections(spec, section_id, parent_id, title, anchor, body, version)`
  - Virtual table `sections_fts` over `title` and `body` using FTS5.
- `src/spec/db.ts` — opens the database read-only at server startup.
- `src/tools/search_spec.ts` — input `{ query, spec?: "ob3" | "vc", limit? }`, runs an FTS5 `MATCH` query with `bm25()` ranking, returns excerpts (≤300 tokens each) with section anchors and URLs.

**Add script:**

```json
"data:ingest": "tsx scripts/ingest-spec.ts"
```

**Pipeline:**

```bash
pnpm data:fetch
pnpm data:ingest
pnpm inspect
```

**Verify:** `search_spec({ query: "proof format" })` returns ranked hits with section anchors. Click one of the URLs in the response — it deep-links to the live spec section.

**Commit:** `feat: spec prose ingestion + search_spec`

---

## Stage 7 — `get_section`, `list_sections`, `cross_reference`

**Goal:** round out spec navigation. All three are cheap on top of the Stage 6 store.

**Files:**

- `src/tools/get_section.ts` — input `{ spec, section_id }`, returns verbatim section body plus its parent chain. Supports `full?: boolean` to return the whole subtree.
- `src/tools/list_sections.ts` — input `{ spec }`, returns the TOC as a nested structure.
- `src/tools/cross_reference.ts` — input `{ term }`, returns every place the term appears across vocab records, prose sections, and (after Stage 8) examples. Implementation: FTS on prose, exact match on vocab records, exact match on context terms.

**Verify:** `cross_reference({ term: "alignment" })` shows the term's appearance in vocab classes (Achievement, Result, …), prose sections, and the context.

**Commit:** `feat: section navigation + cross_reference`

---

## Stage 8 — Examples corpus + `get_examples`

**Goal:** agents copy patterns from canonical examples extremely effectively. Extract them so they're a first-class lookup.

**Update `scripts/ingest-spec.ts`:**

- Walk `<pre>` / `<code>` blocks during spec parsing. Detect JSON-LD by parsing the contents; on parse success, store the example.
- Table `examples(spec, example_id, section_id, title, code, classes_used, version)` where `classes_used` is a JSON array derived from the example's `@type` values (recursive).

**Files:**

- `src/tools/get_examples.ts` — input `{ class_or_topic, limit? }`. If the input matches a vocab class, return examples whose `classes_used` includes it. Otherwise fall back to FTS over the example title and surrounding section text.

**Verify:** `get_examples({ class_or_topic: "AchievementCredential" })` returns at least one full JSON-LD credential example with anchor.

**Commit:** `feat: example extraction + get_examples tool`

---

## Stage 9 — `validate_credential` (lightweight)

**Goal:** make the server a feedback loop, not just a reference. Largest implementation effort in the roadmap, largest agent uplift.

**Install:**

```bash
pnpm add ajv ajv-formats jsonld
```

**Update `scripts/fetch-spec-data.ts`** to download the OB3 JSON Schemas (the AchievementCredential schema and EndorsementCredential schema) from the spec's `/schema/` directory.

**Files:**

- `src/validate/schema.ts` — loads schemas into `ajv` with `addFormats(ajv)`. Returns an error-path-formatted result.
- `src/validate/jsonld.ts` — `await jsonld.expand(doc, { documentLoader })` with a custom `documentLoader` that serves the local snapshot of the OB3 context and the W3C VC context. Walks the expanded form, checks every predicate IRI resolves in the local vocab graph (Stage 2), flags unknown predicates.
- `src/tools/validate_credential.ts` — input `{ json: object | string, mode?: "schema" | "jsonld" | "both" }`. Output `{ ok, errors: Array<{ path, message, severity }>, expanded?: object }`.

**Tests** with two fixtures: a known-good OB3 credential from the spec examples (should pass), and a credential missing `credentialSubject.achievement` (should fail with a path pointing exactly at that location).

**Verify:** Inspector → call `validate_credential` with the known-good fixture → `ok: true`. Pass a broken credential → structured errors with JSON Pointer paths.

**Commit:** `feat: lightweight credential validation`

---

## Stage 10 — `find_conformance_requirements`

**Goal:** extract MUST/SHOULD/MAY normative language as its own queryable index.

**Update `scripts/ingest-spec.ts`** with a second pass:

- Run a regex / sentence-splitter across each section body for sentences containing `\b(MUST|MUST NOT|SHOULD|SHOULD NOT|MAY|REQUIRED|OPTIONAL)\b`.
- Table `conformance(spec, section_id, anchor, sentence, modal, topic_tags)` where `topic_tags` are derived from any vocab class/property names found in the sentence.

**Files:**

- `src/tools/find_conformance_requirements.ts` — input `{ topic, modal?: "MUST" | "SHOULD" | "MAY" }`. FTS over the sentence column, optionally filtered by modal. Returns sentence + section URL + topic tags.

**Verify:** `find_conformance_requirements({ topic: "proof", modal: "MUST" })` returns the spec's MUST statements about proof attachment and verification.

**Commit:** `feat: conformance requirements index`

---

## Stage 11 (optional) — `validate_credential_credo`

**Goal:** offer a second validator that uses credo-ts's actual code path so the agent gets feedback matching runtime behavior.

**Install:**

```bash
pnpm add @credo-ts/core
# plus whatever crypto/key provider your real stack uses
```

**Files:**

- `src/validate/credo.ts` — instantiates a minimal `Agent` (or just the `W3cCredentialService` if you can use it standalone), runs its validation, normalizes its error shape to match `validate_credential`'s output.
- `src/tools/validate_credential_credo.ts` — same input/output shape as the lightweight tool, so the agent can call either based on need.

**Verify:** Same fixtures as Stage 9, both validators agree on the happy path. When they diverge, the credo path is closer to what your runtime will reject.

**Commit:** `feat: credo-ts backed validator`

---

## Cross-cutting decisions to bake in early

These are cheap if you do them in Stage 0–1 and expensive to retrofit later.

**Sources in every tool response.** Every tool's output schema includes a `sources: Array<{ url, anchor, excerpt }>` field, populated wherever applicable. Skip on `ping`. Wire this in at the tool-builder level, not per tool.

**Version tagging.** Every record loaded from disk knows what version it came from (`"3.0.3"`, `"v2"`, etc.). Tool inputs that touch spec data accept an optional `version` parameter that defaults to "latest stable" (configurable in `src/config.ts`).

**Read-only data store.** Open `data/index.db` with `readonly: true`. Ingestion is a separate `pnpm data:ingest` step that writes; the server never writes to it. Makes the server safe to run in parallel and crash-safe.

**Tool definitions co-located with handlers.** One file per tool in `src/tools/`, exporting `{ name, description, inputSchema, handler }`. A single `registerAll(server)` in `src/server.ts` iterates and registers. Adding a tool = one file, one import line.

**Refreshing the snapshot.** `pnpm data:fetch && pnpm data:ingest` re-pulls everything. When you bump versions, commit the new `data/snapshots/<version>/` contents and `data/index.db` so the server is deterministic on clone.

**Optional later:** when you want types shared with credo-ts code, lift `src/vocab/types.ts` and `src/validate/types.ts` into a workspace package (`packages/ob3-types/`) and convert the repo to a pnpm workspace. Don't do this in Stage 0 — it's a 20-minute refactor when you actually need it, and not before.
