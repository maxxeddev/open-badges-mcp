# Contributing

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io/) (corepack-managed via `packageManager` field)

## Setup

```bash
git clone https://github.com/maxxeddev/open-badges-mcp.git
cd open-badges-mcp
pnpm install
```

## Development Workflow

```bash
pnpm dev          # Watch mode (tsx)
pnpm build        # Production build (tsup)
pnpm typecheck    # Type-check without emitting
pnpm lint         # Biome lint + format check
pnpm lint:fix     # Auto-fix lint issues
pnpm test         # Run tests (vitest, single run)
```

### Spec Data

The OB3 spec corpus lives in `data/snapshots/<version>/`. To refresh it:

```bash
pnpm data:fetch   # Download latest spec artifacts
pnpm data:ingest  # Rebuild the SQLite index from snapshots
```

### MCP Inspector

To interactively test the server with the MCP Inspector:

```bash
pnpm build
pnpm inspect
```

## CI

GitHub Actions runs on every push/PR to `main`:

- Lint (Biome)
- Typecheck (tsc)
- Build (tsup)
- Test (vitest)

Matrix: Ubuntu + macOS, Node 20.

## Releasing

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and npm publishing.

### Adding a changeset

When you make a user-facing change, add a changeset before (or with) your PR:

```bash
pnpm changeset
```

Follow the prompts to select a semver bump type (`patch`, `minor`, `major`) and describe the change.

### How releases happen

1. Merge your PR (with its `.changeset/*.md` file) into `main`.
2. The Release workflow detects pending changesets and opens a **"chore: version packages"** PR that bumps `package.json` and updates the changelog.
3. When that version PR is merged, the workflow publishes to npm automatically.

> **Never hand-edit `version` in `package.json`.** Changesets computes the next
> version from the current value plus the pending changesets. A manual bump makes
> it compute from a number that was never published, so the release skips a
> version and the changelog silently loses an entry. Versions 0.3.2 and 0.4.0 were
> both hand-set this way and had to be reconciled after the fact. Let the workflow
> own that field — if a release looks wrong, fix the changesets, not the version.

To preview what the pending changesets will produce without mutating anything:

```bash
pnpm changeset status
```

### Required secrets

The release workflow needs these repository secrets:

| Secret      | Purpose                           |
| ----------- | --------------------------------- |
| `NPM_TOKEN` | npm publish token for the package |

`GITHUB_TOKEN` is provided automatically by Actions.

## Code Style

- [Biome](https://biomejs.dev/) handles linting and formatting — no Prettier/ESLint.
- Run `pnpm lint:fix` or `pnpm format` before committing.
- One MCP tool per file in `src/tools/`.

## Project Structure

```
src/
├── cli.ts          # CLI entry point (bin)
├── server.ts       # MCP server setup
├── config.ts       # Configuration / paths
├── tools/          # One file per MCP tool
├── spec/           # SQLite-backed spec index (sql.js)
├── context/        # JSON-LD context loader
├── vocab/          # RDF vocabulary (N3)
├── validate/       # JSON Schema + JSON-LD validation
├── create/         # Credential builder (rich-tier authoring)
├── generator/      # Type-graph credential generation
├── crypto/         # Canonicalization + signature verification
└── util/           # Shared helpers (output bounding)
```
