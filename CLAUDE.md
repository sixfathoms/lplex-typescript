# lplex-typescript

TypeScript client library and CLI for lplex, a CAN bus HTTP bridge for NMEA 2000. Monorepo with two packages via npm workspaces.

## Build & Test

```bash
npm install                    # install all workspace deps
npm run build                  # build both packages (tsup)
npm run test                   # vitest (library only, 19 tests)
npm run lint                   # biome check
npm run lint:fix               # biome auto-fix
npm run typecheck              # tsc --noEmit on both packages
```

Run the CLI in dev mode:

```bash
cd packages/lplex-cli
npx tsx src/main.ts --server http://inuc1.local:8089
```

## Package Structure

| Package | Path | Owns |
|---|---|---|
| `@sixfathoms/lplex` | `packages/lplex/` | Client library. Zero runtime deps. ESM + CJS + .d.ts via tsup. |
| `@sixfathoms/lplex-cli` | `packages/lplex-cli/` | CLI tool. Port of Go's `lplexdump`. Single ESM bundle with shebang. |

### packages/lplex/ File Map

| File | Owns |
|---|---|
| `src/types.ts` | `Frame`, `Device`, `Event` (discriminated union), `Filter`, `SessionConfig`, `SessionInfo`, `SendParams` |
| `src/errors.ts` | `LplexError`, `HttpError` |
| `src/sse.ts` | `parseSSE` async generator: reads `data:` lines from `ReadableStream<Uint8Array>`, yields `Event` objects |
| `src/client.ts` | `Client` class: `devices()`, `subscribe()`, `send()`, `createSession()`. Injectable `fetch`. |
| `src/session.ts` | `Session` class: `subscribe()`, `ack()`, `info`, `lastAckedSeq` |
| `src/index.ts` | Barrel exports |
| `test/sse.test.ts` | SSE parser unit tests (8 tests) |
| `test/client.test.ts` | Client + Session tests with injected fetch (11 tests) |

### packages/lplex-cli/ File Map

| File | Owns |
|---|---|
| `src/main.ts` | Entry point: arg parsing (node:util parseArgs), mDNS discovery, reconnect loop, ephemeral/buffered modes, periodic ACK, signal handling, JSON/TTY auto-detection |
| `src/display.ts` | ANSI color codes, `formatFrame`, `printDeviceTable` (Unicode box-drawing), `formatBytes` |
| `src/discover.ts` | mDNS discovery via bonjour-service (`_lplex._tcp`, 3s timeout, prefers IPv4) |
| `src/pgn.ts` | PGN name lookup table (100+ entries, 59392-130578) |
| `src/nmea.ts` | Device class names (18 entries) and device function names (90+ entries, keyed by class<<8\|function) |

## Wire Format

All types use `snake_case` field names matching the server's JSON output exactly. No camelCase mapping.

- **Frame events**: JSON objects with `seq`, `ts`, `prio`, `pgn`, `src`, `dst`, `data` (hex string)
- **Device events**: JSON objects with `type: "device"` plus device fields
- **SSE format**: `data: {json}\n\n` lines over HTTP
- **Discrimination**: presence of `type` field distinguishes device from frame events
- **Sequence numbers**: start at 1 (0 means "never ACK'd")
- **Server fields with `omitempty`**: `model_id`, `software_version`, `model_version`, `model_serial`, `product_code`, `unique_number` may be absent from JSON. Handle with `|| ""` / `|| 0`.

## Server Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/events` | GET | Ephemeral SSE stream. Query params: `pgn`, `manufacturer`, `instance`, `name` (repeatable). |
| `/clients/{id}` | PUT | Create/reconnect buffered session. JSON body: `buffer_timeout`, `filter`. |
| `/clients/{id}/events` | GET | Buffered SSE stream with replay from cursor. |
| `/clients/{id}/ack` | PUT | ACK sequence number. JSON body: `{ "seq": N }`. Returns 204. |
| `/send` | POST | Transmit CAN frame. JSON body: `pgn`, `src`, `dst`, `prio`, `data`. Returns 202. |
| `/devices` | GET | Device snapshot. Returns JSON array. |

## Conventions

- Node 18+ (uses global `fetch`, `ReadableStream`, `TextDecoder`)
- TypeScript strict mode, ES2022 target
- Biome for lint and format (must pass before pushing, CI enforces)
- No mocks in tests, real `ReadableStream` instances with injected fetch
- No runtime dependencies in the library
- `bonjour-service` is the only non-dev dependency (CLI only, for mDNS)

## Dependencies

- **Library**: zero runtime deps
- **CLI**: `bonjour-service` (mDNS), `@sixfathoms/lplex` (workspace)
- **Dev**: `tsup` (build), `vitest` (test), `typescript`, `@biomejs/biome` (lint)
