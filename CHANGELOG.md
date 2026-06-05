# mcp-ob-ts

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
