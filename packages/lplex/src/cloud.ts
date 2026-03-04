import { Client, type ClientOptions } from "./client.js";
import { HttpError } from "./errors.js";
import type {
  InstanceStatus,
  InstanceSummary,
  ReplicationEvent,
} from "./types.js";

type FetchFn = typeof globalThis.fetch;

export interface CloudClientOptions {
  fetch?: FetchFn;
}

/**
 * Client for the lplex-cloud management API.
 *
 * For per-instance data (devices, SSE), use {@link client} to get a
 * regular {@link Client} scoped to that instance.
 */
export class CloudClient {
  readonly #baseURL: string;
  readonly #fetch: FetchFn;
  readonly #fetchOpt: CloudClientOptions;

  constructor(baseURL: string, options?: CloudClientOptions) {
    this.#baseURL = baseURL.replace(/\/+$/, "");
    this.#fetch = options?.fetch ?? globalThis.fetch.bind(globalThis);
    this.#fetchOpt = options ?? {};
  }

  /**
   * Returns a {@link Client} scoped to a specific instance.
   * The returned client's `devices()`, `subscribe()`, etc. hit the
   * cloud's per-instance endpoints.
   */
  client(instanceId: string): Client {
    const opts: ClientOptions = {};
    if (this.#fetchOpt.fetch) opts.fetch = this.#fetchOpt.fetch;
    return new Client(`${this.#baseURL}/instances/${instanceId}`, opts);
  }

  /** List all known instances. */
  async instances(signal?: AbortSignal): Promise<InstanceSummary[]> {
    const url = `${this.#baseURL}/instances`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    const data = (await resp.json()) as { instances: InstanceSummary[] };
    return data.instances;
  }

  /** Get detailed replication status for one instance. */
  async status(
    instanceId: string,
    signal?: AbortSignal,
  ): Promise<InstanceStatus> {
    const url = `${this.#baseURL}/instances/${instanceId}/status`;
    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<InstanceStatus>;
  }

  /** Fetch recent replication diagnostic events for an instance. */
  async replicationEvents(
    instanceId: string,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<ReplicationEvent[]> {
    let url = `${this.#baseURL}/instances/${instanceId}/replication/events`;
    if (limit !== undefined) url += `?limit=${limit}`;

    const resp = await this.#fetch(url, { signal });

    if (!resp.ok) {
      const body = await resp.text();
      throw new HttpError("GET", url, resp.status, body);
    }

    return resp.json() as Promise<ReplicationEvent[]>;
  }
}
