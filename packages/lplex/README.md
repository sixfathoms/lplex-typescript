# @sixfathoms/lplex

TypeScript client for [lplex](https://github.com/sixfathoms/lplex), a CAN bus HTTP bridge for NMEA 2000.

Zero runtime dependencies. Works in browsers and Node 18+. Ships ESM, CJS, and TypeScript declarations.

## Install

```bash
npm install @sixfathoms/lplex
```

## Quick Start

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

## API

### `new Client(baseURL, options?)`

Creates a client connected to an lplex server.

```typescript
const client = new Client("http://inuc1.local:8089");
```

Inject a custom `fetch` for testing or environments without a global one:

```typescript
const client = new Client("http://localhost:8089", {
  fetch: myCustomFetch,
});
```

### `client.devices(signal?): Promise<Device[]>`

Returns a snapshot of all NMEA 2000 devices discovered on the bus.

```typescript
const devices = await client.devices();
for (const d of devices) {
  console.log(`${d.manufacturer} (src=${d.src}): ${d.packet_count} packets`);
}
```

### `client.values(filter?, signal?): Promise<DeviceValues[]>`

Returns the last-seen value for each (device, PGN) pair, grouped by device. Useful for getting a snapshot of current bus state without subscribing to SSE.

```typescript
const snapshot = await client.values();
for (const device of snapshot) {
  console.log(`${device.manufacturer} (src=${device.src}):`);
  for (const v of device.values) {
    console.log(`  PGN ${v.pgn}: ${v.data} @ ${v.ts}`);
  }
}
```

Pass a `Filter` to narrow results by PGN and/or device criteria:

```typescript
const positions = await client.values({
  pgn: [129025],
  manufacturer: ["Garmin"],
});
```

### `client.subscribe(filter?, signal?): Promise<AsyncIterable<Event>>`

Opens an ephemeral SSE stream. No session state, no replay. Frames flow until you stop reading or abort.

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
  pgn: [129025, 129026],     // Position Rapid OR COG/SOG Rapid
  manufacturer: ["Garmin"],  // AND from Garmin
});
```

#### Cancellation

Use an `AbortSignal` to stop the stream:

```typescript
const ac = new AbortController();
setTimeout(() => ac.abort(), 10_000);

const stream = await client.subscribe(undefined, ac.signal);
for await (const event of stream) {
  console.log(event);
}
// loop exits when aborted
```

### `client.send(params, signal?): Promise<void>`

Transmit a CAN frame through the server to the bus.

```typescript
await client.send({
  pgn: 129025,
  src: 0,
  dst: 255,
  prio: 6,
  data: "00aabbccddee",
});
```

### `client.createSession(config, signal?): Promise<Session>`

Creates or reconnects a buffered session. The server buffers frames while you're disconnected. On reconnect, you pick up where you left off.

```typescript
const session = await client.createSession({
  clientId: "my-dashboard",
  bufferTimeout: "PT5M",
  filter: { pgn: [129025] },
});

console.log(`cursor at ${session.info.cursor}, head at ${session.info.seq}`);

const stream = await session.subscribe();
let lastSeq = 0;

for await (const event of stream) {
  if (event.type === "frame") {
    lastSeq = event.frame.seq;
    console.log(JSON.stringify(event.frame));
  }
}

// advance the cursor so the server can free buffer space
await session.ack(lastSeq);
```

### `session.subscribe(signal?): Promise<AsyncIterable<Event>>`

Opens the SSE stream for a buffered session. Replays from the cursor, then streams live.

### `session.ack(seq, signal?): Promise<void>`

Advances the cursor to the given sequence number.

### `session.info: SessionInfo`

The session metadata returned by the server on create/reconnect.

### `session.lastAckedSeq: number`

The last sequence number successfully ACK'd (0 if never ACK'd).

## Error Handling

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

## Browser Usage

The library uses only web platform APIs (`fetch`, `ReadableStream`, `TextDecoder`, `AbortSignal`), so it works in any modern browser without polyfills.

```html
<script type="module">
  import { Client } from "https://esm.sh/@sixfathoms/lplex";

  const client = new Client("http://your-lplex-server:8089");
  const devices = await client.devices();
  console.log(devices);
</script>
```

### React

```tsx
import { useState, useEffect } from "react";
import { Client, type Frame, type Filter } from "@sixfathoms/lplex";

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

## Types

All interfaces use `snake_case` field names matching the server's JSON wire format. No mapping layer.

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
  name: string;
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

type Event =
  | { type: "frame"; frame: Frame }
  | { type: "device"; device: Device };

interface Filter {
  pgn?: number[];
  manufacturer?: string[];
  instance?: number[];
  name?: string[];
}

interface SessionConfig {
  clientId: string;
  bufferTimeout: string;   // ISO 8601 duration ("PT5M", "PT1H")
  filter?: Filter;
}

interface SessionInfo {
  client_id: string;
  seq: number;             // current head
  cursor: number;          // last ACK'd (0 = never)
  devices: Device[];
}

interface SendParams {
  pgn: number;
  src: number;
  dst: number;
  prio: number;
  data: string;            // hex-encoded
}

interface PGNValue {
  pgn: number;
  ts: string;              // RFC 3339 timestamp
  data: string;            // hex-encoded payload
  seq: number;             // sequence number
}

interface DeviceValues {
  name: string;            // hex CAN NAME (empty if unknown)
  src: number;             // source address
  manufacturer?: string;
  model_id?: string;
  values: PGNValue[];      // sorted by PGN
}
```

## Server Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/events` | GET | Ephemeral SSE stream. Query params: `pgn`, `manufacturer`, `instance`, `name` (repeatable). |
| `/clients/{id}` | PUT | Create/reconnect buffered session. JSON body: `buffer_timeout`, `filter`. |
| `/clients/{id}/events` | GET | Buffered SSE stream with replay from cursor. |
| `/clients/{id}/ack` | PUT | ACK sequence number. JSON body: `{ "seq": N }`. Returns 204. |
| `/send` | POST | Transmit CAN frame. JSON body: `pgn`, `src`, `dst`, `prio`, `data`. Returns 202. |
| `/devices` | GET | Device snapshot. Returns JSON array. |
| `/values` | GET | Last-seen value per (device, PGN). Query params: `pgn`, `manufacturer`, `instance`, `name` (repeatable). Returns JSON array grouped by device. |

## License

MIT
