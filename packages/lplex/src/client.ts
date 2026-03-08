import { HttpError } from "./errors.js";
import { Session } from "./session.js";
import { parseSSE } from "./sse.js";
import type {
  DecodedDeviceValues,
  Device,
  DeviceValues,
  Event,
  Filter,
  Frame,
  HealthStatus,
  QueryParams,
  ReplicationStatus,
  SendParams,
  SessionConfig,
  SessionInfo,
} from "./types.js";

type FetchFn = typeof globalThis.fetch;

export interface ClientOptions {
  fetch?: FetchFn;
}

export class Client {
  readonly #baseURL: string;
  readonly #fetch: FetchFn;

  constructor(baseURL: string, options?: ClientOptions) {
    this.#baseURL = baseURL.replace(/\/+$/, "");
    this.#fetch = options?.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Fetch a snapshot of all NMEA 2000 devices discovered by the server. */
  async devices(signal?: AbortSignal): Promise<Device[]> {
    const url = `${this.#baseURL}/devices`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<Device[]>;
  }

  /** Fetch the last-seen value for each (device, PGN) pair. */
  async values(filter?: Filter, signal?: AbortSignal): Promise<DeviceValues[]> {
    let url = `${this.#baseURL}/values`;
    const qs = filterToQueryString(filter);
    if (qs) url += `?${qs}`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<DeviceValues[]>;
  }

  /**
   * Open an ephemeral SSE stream with optional filtering.
   * No session, no replay, no ACK.
   */
  async subscribe(
    filter?: Filter,
    signal?: AbortSignal,
  ): Promise<AsyncIterable<Event>> {
    let url = `${this.#baseURL}/events`;
    const qs = filterToQueryString(filter);
    if (qs) url += `?${qs}`;

    const resp = await this.#fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal,
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    if (!resp.body) {
      throw new HttpError("GET", url, resp.status, "no response body");
    }

    return parseSSE(resp.body);
  }

  /** Fetch the last-seen decoded values for each (device, PGN) pair. */
  async decodedValues(
    filter?: Filter,
    signal?: AbortSignal,
  ): Promise<DecodedDeviceValues[]> {
    let url = `${this.#baseURL}/values/decoded`;
    const qs = filterToQueryString(filter);
    if (qs) url += `?${qs}`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<DecodedDeviceValues[]>;
  }

  /** Transmit a CAN frame through the server. */
  async send(params: SendParams, signal?: AbortSignal): Promise<void> {
    const url = `${this.#baseURL}/send`;
    const resp = await this.#fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });

    if (resp.status !== 202) {
      const body = await resp.text();
      throw new HttpError("POST", url, resp.status, body);
    }
  }

  /**
   * Send an ISO Request (PGN 59904) and wait for the response frame.
   * Returns the response frame, or throws HttpError with status 504 on timeout.
   */
  async query(params: QueryParams, signal?: AbortSignal): Promise<Frame> {
    const url = `${this.#baseURL}/query`;
    const resp = await this.#fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("POST", url, resp.status, body);
    }

    return resp.json() as Promise<Frame>;
  }

  /** Check server health. */
  async health(signal?: AbortSignal): Promise<HealthStatus> {
    const url = `${this.#baseURL}/healthz`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<HealthStatus>;
  }

  /** Fetch boat-side replication status (only available when replication is configured). */
  async replicationStatus(signal?: AbortSignal): Promise<ReplicationStatus> {
    const url = `${this.#baseURL}/replication/status`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<ReplicationStatus>;
  }

  /** Create or reconnect a buffered session on the server. */
  async createSession(
    config: SessionConfig,
    signal?: AbortSignal,
  ): Promise<Session> {
    const url = `${this.#baseURL}/clients/${config.clientId}`;

    const putBody: Record<string, unknown> = {
      buffer_timeout: config.bufferTimeout,
    };
    if (config.filter && !filterIsEmpty(config.filter)) {
      putBody.filter = filterToJSON(config.filter);
    }

    const resp = await this.#fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(putBody),
      signal,
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("PUT", url, resp.status, body);
    }

    const info = (await resp.json()) as SessionInfo;
    return new Session(this.#baseURL, this.#fetch, info);
  }
}

function filterIsEmpty(f: Filter): boolean {
  return (
    !f.pgn?.length &&
    !f.exclude_pgn?.length &&
    !f.manufacturer?.length &&
    !f.instance?.length &&
    !f.name?.length &&
    !f.exclude_name?.length
  );
}

function filterToQueryString(f?: Filter): string {
  if (!f || filterIsEmpty(f)) return "";

  const params = new URLSearchParams();
  for (const p of f.pgn ?? []) params.append("pgn", p.toString());
  for (const p of f.exclude_pgn ?? [])
    params.append("exclude_pgn", p.toString());
  for (const m of f.manufacturer ?? []) params.append("manufacturer", m);
  for (const i of f.instance ?? []) params.append("instance", i.toString());
  for (const n of f.name ?? []) params.append("name", n);
  for (const n of f.exclude_name ?? []) params.append("exclude_name", n);
  return params.toString();
}

function filterToJSON(f: Filter): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  if (f.pgn?.length) m.pgn = f.pgn;
  if (f.exclude_pgn?.length) m.exclude_pgn = f.exclude_pgn;
  if (f.manufacturer?.length) m.manufacturer = f.manufacturer;
  if (f.instance?.length) m.instance = f.instance;
  if (f.name?.length) m.name = f.name;
  if (f.exclude_name?.length) m.exclude_name = f.exclude_name;
  return m;
}
