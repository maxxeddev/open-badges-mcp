# mcp-ob-ts

## 0.4.0

### Minor Changes

- 93d4d83: Harden the OB3 tool surface across the builder, validator, generator, and lookup paths.
  
  - **Builder** — full rich-tier authoring for `result`, `source`, `alignment`, `related`, `proof`, `credentialStatus`, `endorsement`, `termsOfUse`, `refreshService`, `credentialSchema`, and `validUntil`, with type synthesis and a `validUntil` coherency warning. Unrecognized input fields now surface a coded warning naming the field's path instead of being silently dropped.
  - **Validator** — structural unwrapping of verifiable presentations, batch responses, and enveloped VC-JWT / SD-JWT payloads, plus cryptographic signature verification for `eddsa-rdfc-2022` and `ecdsa-rdfc-2019`. Schema, JSON-LD, and signature validation now run as three independent checks so a failure in one no longer masks the others.
  - **Generator** — class-subset targeting, real Ed25519 proof attachment, output bounding, and documented `seed` + `mode` + `maxDepth` determinism.
  - **Lookup** — fuzzy term matching via FTS4 prefix search with a LIKE fallback, re-ranked by Jaccard and Levenshtein distance, with modal filtering.
  - **Shared** — a common output-bounding utility (continuation tokens, summary fallback, sandbox file last resort) now backs `generate_credential`, `list_sections`, `cross_reference`, and `find_conformance_requirements`; a shared crypto canonicalization core (URDNA2015 + SHA-256 with an offline document loader) backs both the validator and the generator.
- fa8403d: Add realistic content mode for rendering-app testing. The `generate_credential` tool now accepts `contentMode: "realistic"` which uses @faker-js/faker to produce human-readable values (company names, catchphrases, lorem descriptions, picsum image URLs, properly-formed DIDs) instead of UUIDs. Default behavior (`contentMode: "uuid"`) is unchanged.

### Patch Changes

- d758f70: Resolve terms defined inside type-scoped JSON-LD contexts, and report the real server version.
  
  The context loader only read top-level `@context` entries, so every term declared
  inside a type-scoped context block was invisible. That left 72 of the 77 scoped
  terms unresolvable — `achievement`, `criteria`, `achievementType`, `creditsEarned`,
  `familyName`, `geo` and most other OB3 properties. `resolve_term` returned
  "not found" for `achievement`, the example given in its own tool description.
  The loader now walks the context breadth-first, so scoped terms resolve while
  top-level terms stay canonical and are never shadowed. This also improves
  `cross_reference` context matches and makes `get_context` return the full term map
  (~140 entries, up from 30).
  
  Because the vocabulary legitimately points a property term at the class IRI that
  types its value (`criteria` → `#Criteria`, `geo` → `#GeoCoordinates`), the term →
  IRI mapping is many-to-one. `iriToTerm` keeps the top-level term as the canonical
  label for each IRI.
  
  Separately, the MCP server advertised a hardcoded `version: "0.1.0"` to clients
  regardless of the package version. It now reports the real version from
  `package.json`.

## 0.3.2

### Patch Changes

- Make data directory resolution explicit and conditional

  `resolveDataDir()` now returns `{dataDir, isExplicit}` and a `bundledDataDir()`
  helper was added. The server defaults to the packaged `data/` folder unless the
  user supplies `--data-dir` or sets `XDG_DATA_HOME`, and the download/ingest init
  flow only runs when the location is explicit or `--init` is passed. This stops a
  globally installed or `npx`-invoked package from attempting a network fetch on
  first run when the bundled data is already present.

## 0.3.1

### Patch Changes

- Fix missing data/sources.json in npm tarball causing ENOENT on installed package

  The `files` field in package.json did not include `data/sources.json`, so the published
  tarball shipped without it. When the server started via npx or global install,
  `loadSources()` would fail with ENOENT. Added the file to the tarball and a release
  smoke test that exercises the installed package to prevent this class of regression.

## 0.3.0

### Minor Changes

- 5766212: ### v0.2.1

  - `range` field on `get_class`, `get_property`, and `list_properties` outputs is now a structured array of typed members (datatype / vocab-class / external) — completes the structured-shape change started in v0.2.0. **Breaking** for any consumer that pinned 0.2.0 and parsed `range` as a string.
