# PhotoSheet-Maker

Web app for producing print-ready ID-photo sheets at exact physical size. Upload photos, crop to an ID standard, export a sheet (PNG / JPG / PDF).

**In-memory only** — no image is ever written to disk, cached, or sent to a third party. See the build spec for the full architectural privacy contract.

## Status

Phase 1 in progress: `packages/shared` (constants, units, errors, Zod, layout engine).

## Requirements

- Node.js 22 LTS
- pnpm 9+

## Getting started

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## Layout

```
apps/       # web (Vite) and api (Azure Functions) — added in later phases
packages/
  shared/   # zero-I/O: constants, unit conversion, Zod schemas, errors, layout engine
infra/      # Bicep — added in phase 6
```
