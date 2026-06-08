---
"mcp-ob-ts": minor
---

Add realistic content mode for rendering-app testing. The `generate_credential` tool now accepts `contentMode: "realistic"` which uses @faker-js/faker to produce human-readable values (company names, catchphrases, lorem descriptions, picsum image URLs, properly-formed DIDs) instead of UUIDs. Default behavior (`contentMode: "uuid"`) is unchanged.
