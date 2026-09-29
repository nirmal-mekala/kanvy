# kanvy

local-first infinite canvas app

## status

Experimental. Expect rough edges and breaking schema changes; nothing here is
stable yet.

See `AGENTS.md` and `ctx/` for the full design history and rationale.

## running it

```sh
pnpm install
pnpm dev
```

By default the app runs in local mode, persisting to `localStorage`. A
"Network" mode also exists, backed by a small `json-server` REST backend
for development:

```sh
pnpm dev:server
```

## scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the app (Vite dev server) |
| `pnpm dev:server` | Start the json-server dev backend for Network mode |
| `pnpm build` | Type-check and build for production |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm e2e` | Run end-to-end tests (Playwright) |
| `pnpm lint` | Lint/format check (Biome) |
| `pnpm typecheck` | Type-check only |
| `pnpm fallow` | Static code-health audit |
