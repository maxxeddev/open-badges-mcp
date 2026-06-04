# mcp-ob-ts

## 0.3.0

### Minor Changes

- 5766212: ### v0.2.1

  - `range` field on `get_class`, `get_property`, and `list_properties` outputs is now a structured array of typed members (datatype / vocab-class / external) — completes the structured-shape change started in v0.2.0. **Breaking** for any consumer that pinned 0.2.0 and parsed `range` as a string.
