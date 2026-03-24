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
  HistoryParams,
  QueryParams,
  ReplicationStatus,
  SendParams,
  SessionConfig,
  SessionInfo,
  SubscribeOptions,
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
   *
   * Accepts either a Filter (for backwards compatibility) or
   * SubscribeOptions for additional control (decode, signal).
   */
  async subscribe(
    filterOrOptions?: Filter | SubscribeOptions,
    signal?: AbortSignal,
  ): Promise<AsyncIterable<Event>> {
    let filter: Filter | undefined;
    let decode: boolean | undefined;
    let sig: AbortSignal | undefined = signal;

    if (filterOrOptions && isSubscribeOptions(filterOrOptions)) {
      filter = filterOrOptions.filter;
      decode = filterOrOptions.decode;
      sig = filterOrOptions.signal ?? sig;
    } else {
      filter = filterOrOptions as Filter | undefined;
    }

    let url = `${this.#baseURL}/events`;
    const qs = filterToQueryString(filter, decode);
    if (qs) url += `?${qs}`;

    const resp = await this.#fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: sig,
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
   * Returns the response frame, or throws HttpError on timeout (408).
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

  /**
   * Query historical frames (requires journaling on the server).
   * Returns an array of frames matching the query parameters.
   */
  async history(params: HistoryParams, signal?: AbortSignal): Promise<Frame[]> {
    const qs = new URLSearchParams();
    qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    for (const p of params.pgn ?? []) qs.append("pgn", p.toString());
    for (const s of params.src ?? []) qs.append("src", s.toString());
    if (params.limit !== undefined) qs.set("limit", params.limit.toString());
    if (params.interval) qs.set("interval", params.interval);
    if (params.decode) qs.set("decode", "true");

    const url = `${this.#baseURL}/history?${qs.toString()}`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<Frame[]>;
  }

  /** Check server health (GET /healthz). */
  async health(signal?: AbortSignal): Promise<HealthStatus> {
    const url = `${this.#baseURL}/healthz`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<HealthStatus>;
  }

  /** Liveness probe (GET /livez). */
  async liveness(signal?: AbortSignal): Promise<HealthStatus> {
    const url = `${this.#baseURL}/livez`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<HealthStatus>;
  }

  /** Readiness probe (GET /readyz). */
  async readiness(signal?: AbortSignal): Promise<HealthStatus> {
    const url = `${this.#baseURL}/readyz`;
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

function isSubscribeOptions(
  obj: Filter | SubscribeOptions,
): obj is SubscribeOptions {
  return "decode" in obj || "signal" in obj || "filter" in obj;
}

function filterIsEmpty(f: Filter): boolean {
  return (
    !f.pgn?.length &&
    !f.exclude_pgn?.length &&
    !f.manufacturer?.length &&
    !f.instance?.length &&
    !f.name?.length &&
    !f.exclude_name?.length &&
    !f.bus?.length
  );
}

function filterToQueryString(f?: Filter, decode?: boolean): string {
  if ((!f || filterIsEmpty(f)) && !decode) return "";

  const params = new URLSearchParams();
  if (f) {
    for (const p of f.pgn ?? []) params.append("pgn", p.toString());
    for (const p of f.exclude_pgn ?? [])
      params.append("exclude_pgn", p.toString());
    for (const m of f.manufacturer ?? []) params.append("manufacturer", m);
    for (const i of f.instance ?? []) params.append("instance", i.toString());
    for (const n of f.name ?? []) params.append("name", n);
    for (const n of f.exclude_name ?? []) params.append("exclude_name", n);
    for (const b of f.bus ?? []) params.append("bus", b);
  }
  if (decode) params.set("decode", "true");
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
  if (f.bus?.length) m.bus = f.bus;
  return m;
}
