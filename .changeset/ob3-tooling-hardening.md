---
"mcp-ob-ts": minor
---

Harden the OB3 tool surface across the builder, validator, generator, and lookup paths.

- **Builder** — full rich-tier authoring for `result`, `source`, `alignment`, `related`, `proof`, `credentialStatus`, `endorsement`, `termsOfUse`, `refreshService`, `credentialSchema`, and `validUntil`, with type synthesis and a `validUntil` coherency warning. Unrecognized input fields now surface a coded warning naming the field's path instead of being silently dropped.
- **Validator** — structural unwrapping of verifiable presentations, batch responses, and enveloped VC-JWT / SD-JWT payloads, plus cryptographic signature verification for `eddsa-rdfc-2022` and `ecdsa-rdfc-2019`. Schema, JSON-LD, and signature validation now run as three independent checks so a failure in one no longer masks the others.
- **Generator** — class-subset targeting, real Ed25519 proof attachment, output bounding, and documented `seed` + `mode` + `maxDepth` determinism.
- **Lookup** — fuzzy term matching via FTS4 prefix search with a LIKE fallback, re-ranked by Jaccard and Levenshtein distance, with modal filtering.
- **Shared** — a common output-bounding utility (continuation tokens, summary fallback, sandbox file last resort) now backs `generate_credential`, `list_sections`, `cross_reference`, and `find_conformance_requirements`; a shared crypto canonicalization core (URDNA2015 + SHA-256 with an offline document loader) backs both the validator and the generator.
