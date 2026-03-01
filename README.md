# lplex-typescript

TypeScript client library and CLI for [lplex](https://github.com/sixfathoms/lplex), a CAN bus HTTP bridge for NMEA 2000.

lplex reads raw CAN frames from a SocketCAN interface, reassembles fast-packets, tracks device discovery, and streams frames to clients over SSE. This repo provides the TypeScript side: a zero-dependency client library (`@sixfathoms/lplex`) and a full-featured CLI (`@sixfathoms/lplex-cli`) that mirrors Go's `lplexdump`.

## Packages

| Package | Description |
|---|---|
| [`@sixfathoms/lplex`](packages/lplex/) | Client library. Zero runtime dependencies, works in browsers and Node 18+. |
| [`@sixfathoms/lplex-cli`](packages/lplex-cli/) | CLI tool. Port of `lplexdump` with colored output, device tables, mDNS discovery. |

## Quick Start

```bash
npm install @sixfathoms/lplex
```

```typescript
import { Client } from "@sixfathoms/lplex";

const client = new Client("http://localhost:8089");

// list devices on the bus
const devices = await client.devices();

// stream frames
const stream = await client.subscribe({ pgn: [129025] });
for await (const event of stream) {
  if (event.type === "frame") {
    console.log(event.frame.pgn, event.frame.data);
  }
}
```

---

## Library (`@sixfathoms/lplex`)

### Installation

```bash
npm install @sixfathoms/lplex
```

ESM and CJS both work. TypeScript declarations are included.

### Creating a Client

```typescript
import { Client } from "@sixfathoms/lplex";

const client = new Client("http://your-lplex-server:8089");
```

You can inject a custom `fetch` for testing or environments without a global fetch:

```typescript
const client = new Client("http://localhost:8089", {
  fetch: myCustomFetch,
});
```

### Fetching Devices

Returns a snapshot of all NMEA 2000 devices the server has discovered on the bus.

```typescript
const devices = await client.devices();

for (const d of devices) {
  console.log(`${d.manufacturer} (src=${d.src}): ${d.packet_count} packets`);
}
```

### Ephemeral Streaming

Opens a Server-Sent Events stream. No session state, no replay, no acknowledgment. Frames flow until you stop reading or abort.

```typescript
const stream = await client.subscribe();

for await (const event of stream) {
  switch (event.type) {
    case "frame":
      console.log(event.frame.pgn, event.frame.src, event.frame.data);
      break;
    case "device":
      console.log("device:", event.device.manufacturer, event.device.src);
      break;
  }
}
```

#### Filtering

Pass a `Filter` to narrow the stream. Categories are AND'd, values within a category are OR'd.

```typescript
const stream = await client.subscribe({
  pgn: [129025, 129026],        // Position Rapid OR COG/SOG Rapid
  manufacturer: ["Garmin"],      // AND from Garmin
});
```

#### Cancellation

Use an `AbortSignal` to stop the stream:

```typescript
const ac = new AbortController();

// stop after 10 seconds
setTimeout(() => ac.abort(), 10_000);

const stream = await client.subscribe(undefined, ac.signal);
for await (const event of stream) {
  console.log(event);
}
// loop exits when aborted
```

### Buffered Sessions

Sessions give you cursor-based replay. If your client disconnects, the server buffers frames for the configured duration. On reconnect, you pick up where you left off.

```typescript
// create or reconnect a session
const session = await client.createSession({
  clientId: "my-dashboard",
  bufferTimeout: "PT5M",         // server buffers for 5 minutes
  filter: { pgn: [129025] },
});

console.log(`cursor at ${session.info.cursor}, head at ${session.info.seq}`);

// stream with replay from cursor
const stream = await session.subscribe();

let lastSeq = 0;
for await (const event of stream) {
  if (event.type === "frame") {
    lastSeq = event.frame.seq;
    process.stdout.write(JSON.stringify(event.frame) + "\n");
  }
}

// advance the cursor so the server can free buffer space
await session.ack(lastSeq);
```

### Sending Frames

Transmit a CAN frame through the server to the bus:

```typescript
await client.send({
  pgn: 129025,
  src: 0,
  dst: 255,     // broadcast
  prio: 6,
  data: "00aabbccddee",
});
```

### Error Handling

All methods throw `HttpError` on non-success HTTP responses:

```typescript
import { HttpError } from "@sixfathoms/lplex";

try {
  await client.devices();
} catch (err) {
  if (err instanceof HttpError) {
    console.error(`HTTP ${err.status}: ${err.body}`);
  }
}
```

### Browser Usage

The library uses only web platform APIs (`fetch`, `ReadableStream`, `TextDecoder`, `AbortSignal`), so it works in any modern browser without polyfills.

```html
<script type="module">
  import { Client } from "https://esm.sh/@sixfathoms/lplex";

  const client = new Client("http://your-lplex-server:8089");
  const devices = await client.devices();
  console.log(devices);
</script>
```

React example with cleanup:

```tsx
function useFrames(serverUrl: string, filter?: Filter) {
  const [frames, setFrames] = useState<Frame[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    const client = new Client(serverUrl);

    (async () => {
      const stream = await client.subscribe(filter, ac.signal);
      for await (const event of stream) {
        if (event.type === "frame") {
          setFrames((prev) => [...prev.slice(-99), event.frame]);
        }
      }
    })().catch(() => {});

    return () => ac.abort();
  }, [serverUrl]);

  return frames;
}
```

### Node.js Usage

Works out of the box with Node 18+ (which has global `fetch`).

```typescript
import { Client } from "@sixfathoms/lplex";

const client = new Client("http://inuc1.local:8089");

const stream = await client.subscribe({ pgn: [127250] });
for await (const event of stream) {
  if (event.type === "frame") {
    console.log(JSON.stringify(event.frame));
  }
}
```

Pipe to a file for logging:

```bash
node your-script.js > frames.jsonl
```

### Types Reference

All interfaces use `snake_case` field names to match the JSON wire format exactly. No mapping layer.

```typescript
interface Frame {
  seq: number;        // monotonic, starts at 1
  ts: string;         // RFC 3339 timestamp
  prio: number;       // 0-7
  pgn: number;        // Parameter Group Number
  src: number;        // source address (0-253)
  dst: number;        // destination (255 = broadcast)
  data: string;       // hex-encoded payload
}

interface Device {
  src: number;
  name: string;                // 64-bit CAN NAME as hex
  manufacturer: string;
  manufacturer_code: number;
  device_class: number;
  device_function: number;
  device_instance: number;
  unique_number: number;
  model_id: string;
  software_version: string;
  model_version: string;
  model_serial: string;
  product_code: number;
  first_seen: string;
  last_seen: string;
  packet_count: number;
  byte_count: number;
}

// Discriminated union, use event.type for exhaustive switching
type Event =
  | { type: "frame"; frame: Frame }
  | { type: "device"; device: Device };

interface Filter {
  pgn?: number[];
  manufacturer?: string[];
  instance?: number[];
  name?: string[];           // hex CAN NAMEs
}

interface SessionConfig {
  clientId: string;
  bufferTimeout: string;     // ISO 8601 duration ("PT5M", "PT1H")
  filter?: Filter;
}

interface SessionInfo {
  client_id: string;
  seq: number;               // current head
  cursor: number;            // last ACK'd (0 = never)
  devices: Device[];
}

interface SendParams {
  pgn: number;
  src: number;
  dst: number;
  prio: number;
  data: string;              // hex-encoded
}
```

---

## CLI (`@sixfathoms/lplex-cli`)

TypeScript port of `lplexdump`. Colored frame output, Unicode device tables, mDNS auto-discovery, buffered sessions with ACK.

### Usage

```bash
# auto-discover server via mDNS
npx @sixfathoms/lplex-cli

# specify server
npx @sixfathoms/lplex-cli --server http://inuc1.local:8089

# filter by PGN
npx @sixfathoms/lplex-cli -s http://inuc1.local:8089 --pgn 129025 --pgn 129026

# buffered mode (session with replay)
npx @sixfathoms/lplex-cli -s http://inuc1.local:8089 --buffer-timeout PT5M

# pipe JSON to jq
npx @sixfathoms/lplex-cli -s http://inuc1.local:8089 | jq .pgn

# quiet mode (no stderr status messages)
npx @sixfathoms/lplex-cli -s http://inuc1.local:8089 -q --json > frames.jsonl
```

### All Flags

```
Connection:
  -s, --server <url>          lplex server URL (auto-discovered via mDNS if omitted)
  --client-id <id>            session client ID (defaults to hostname)
  --buffer-timeout <duration> ISO 8601 duration (e.g. PT5M) to enable buffered mode
  --no-reconnect              disable auto-reconnect on disconnect
  --reconnect-delay <secs>    seconds between reconnect attempts (default: 2)
  --ack-interval <secs>       seconds between ACKs in buffered mode (default: 5)

Filters (categories AND'd, values within a category OR'd):
  --pgn <number>              filter by PGN (repeatable)
  --manufacturer <name>       filter by manufacturer name or code (repeatable)
  --instance <number>         filter by device instance (repeatable)
  --name <hex>                filter by 64-bit CAN NAME in hex (repeatable)

Output:
  -q, --quiet                 suppress status messages on stderr
  --json                      force JSON output (auto-enabled when stdout is piped)

Other:
  -v, --version               print version and exit
  -h, --help                  show this help
```

### Output Modes

**Terminal** (default when stdout is a TTY): colored frame lines with timestamps, source labels, PGN names, and a Unicode device table on stderr.

**JSON** (when piped, or with `--json`): one JSON object per line on stdout, device events on stderr. Suitable for piping to `jq`, logging to files, or feeding into other tools.

---

## Contributing

### Prerequisites

- Node.js 22+
- npm 10+

### Setup

```bash
git clone https://github.com/sixfathoms/lplex-typescript.git
cd lplex-typescript
npm install
```

This installs dependencies for both packages via npm workspaces.

### Building

```bash
npm run build          # build both packages
```

The library outputs ESM (`dist/index.js`), CJS (`dist/index.cjs`), and TypeScript declarations (`dist/index.d.ts`). The CLI outputs a single ESM file with a Node shebang (`dist/main.js`).

### Testing

```bash
npm test               # run all tests (vitest)
```

Tests live in `packages/lplex/test/`. 19 tests cover the SSE parser and client/session logic using injected fetch (no mocks, real `ReadableStream` instances).

### Linting

```bash
npm run lint           # check with biome
npm run lint:fix       # auto-fix
```

Uses [Biome](https://biomejs.dev/) for linting and formatting. The CI workflow enforces this.

### Type Checking

```bash
npm run typecheck      # tsc --noEmit on both packages
```

### Running the CLI in Development

```bash
cd packages/lplex-cli
npx tsx src/main.ts --server http://your-server:8089
```

### Project Structure

```
lplex-typescript/
  package.json            workspace root
  biome.json              lint + format config
  tsconfig.base.json      shared TypeScript base config
  packages/
    lplex/                @sixfathoms/lplex (library)
      src/
        index.ts          barrel exports
        types.ts          Frame, Device, Event, Filter, etc.
        errors.ts         LplexError, HttpError
        sse.ts            async generator SSE parser
        client.ts         Client class
        session.ts        Session class
      test/
        sse.test.ts       SSE parser tests
        client.test.ts    client + session tests
    lplex-cli/            @sixfathoms/lplex-cli (CLI)
      src/
        main.ts           entry point, arg parsing, run loop
        display.ts        ANSI colors, frame formatting, device table
        discover.ts       mDNS discovery via bonjour-service
        pgn.ts            PGN name lookup (100+ entries)
        nmea.ts           device class + function lookup tables
```

### CI

GitHub Actions runs on every push to `main` and on pull requests:

1. Install dependencies
2. Lint (biome)
3. Build (tsup, both packages)
4. Typecheck (tsc, both packages)
5. Test (vitest, 19 tests)

### Design Decisions

- **Zero runtime dependencies** in the library. Only web platform APIs (`fetch`, `ReadableStream`, `TextDecoder`, `AbortSignal`).
- **`AsyncIterable` for streams**. `for await (const event of stream)` is idiomatic. Cancellation via `AbortSignal`.
- **No auto-reconnect** in the library. The caller controls retry logic. The CLI implements its own reconnect loop.
- **Injectable `fetch`**. Testable without a real server, works in custom environments.
- **Discriminated union for events**. `event.type` enables exhaustive switch checking, no null pointer checks.
- **`snake_case` field names**. Matches the JSON wire format from the server. No mapping layer, no runtime overhead.
- **Biome over ESLint**. Faster, simpler config, handles both linting and formatting.

## License

MIT
