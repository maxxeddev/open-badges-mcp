---
"mcp-ob-ts": patch
---

Resolve terms defined inside type-scoped JSON-LD contexts, and report the real server version.

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
