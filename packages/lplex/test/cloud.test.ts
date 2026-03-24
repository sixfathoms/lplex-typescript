import { describe, expect, it } from "vitest";
import { CloudClient } from "../src/cloud.js";
import { HttpError } from "../src/errors.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

describe("CloudClient.instances", () => {
  it("fetches the instance list", async () => {
    const payload = {
      instances: [
        {
          id: "boat-1",
          connected: true,
          cursor: 1000,
          boat_head_seq: 1050,
          holes: 2,
          lag_seqs: 50,
          last_seen: "2026-03-01T00:00:00Z",
        },
      ],
    };

    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("https://cloud.example.com/instances");
      return jsonResponse(payload);
    };

    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.instances();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("boat-1");
    expect(result[0].connected).toBe(true);
    expect(result[0].lag_seqs).toBe(50);
  });

  it("throws HttpError on failure", async () => {
    const mockFetch = async () => errorResponse(500, "boom");
    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.instances()).rejects.toThrow(HttpError);
  });
});

describe("CloudClient.status", () => {
  it("fetches instance status", async () => {
    const payload = {
      id: "boat-1",
      connected: true,
      cursor: 1000,
      boat_head_seq: 1050,
      boat_journal_bytes: 50000,
      holes: [{ start: 500, end: 600 }],
      lag_seqs: 50,
      last_seen: "2026-03-01T00:00:00Z",
    };

    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("https://cloud.example.com/instances/boat-1/status");
      return jsonResponse(payload);
    };

    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.status("boat-1");
    expect(result.id).toBe("boat-1");
    expect(result.holes).toHaveLength(1);
    expect(result.holes[0].start).toBe(500);
  });

  it("throws HttpError on 404", async () => {
    const mockFetch = async () => errorResponse(404, "instance not found");
    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.status("nope")).rejects.toThrow(HttpError);
  });
});

describe("CloudClient.replicationEvents", () => {
  it("fetches replication events", async () => {
    const events = [
      {
        time: "2026-03-01T00:00:00Z",
        type: "live_start",
        detail: { boat_head_seq: 1000 },
      },
      {
        time: "2026-03-01T00:00:01Z",
        type: "checkpoint",
        detail: { frames_received: 50000 },
      },
    ];

    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe(
        "https://cloud.example.com/instances/boat-1/replication/events",
      );
      return jsonResponse(events);
    };

    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.replicationEvents("boat-1");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("live_start");
    expect(result[1].detail?.frames_received).toBe(50000);
  });

  it("passes limit as query param", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return jsonResponse([]);
    };

    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    await client.replicationEvents("boat-1", 10);
    expect(capturedURL).toBe(
      "https://cloud.example.com/instances/boat-1/replication/events?limit=10",
    );
  });

  it("throws HttpError on 404", async () => {
    const mockFetch = async () => errorResponse(404, "instance not found");
    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.replicationEvents("nope")).rejects.toThrow(HttpError);
  });
});

describe("CloudClient.health", () => {
  it("fetches cloud health status", async () => {
    const payload = {
      status: "ok",
      instances_total: 10,
      instances_connected: 8,
    };
    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("https://cloud.example.com/healthz");
      return jsonResponse(payload);
    };

    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.health();
    expect(result.status).toBe("ok");
    expect(result.instances_total).toBe(10);
    expect(result.instances_connected).toBe(8);
  });
});

describe("CloudClient.liveness", () => {
  it("fetches liveness", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("https://cloud.example.com/livez");
      return jsonResponse({ status: "ok" });
    };

    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.liveness();
    expect(result.status).toBe("ok");
  });
});

describe("CloudClient.readiness", () => {
  it("fetches readiness", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("https://cloud.example.com/readyz");
      return jsonResponse({ status: "ok" });
    };

    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.readiness();
    expect(result.status).toBe("ok");
  });

  it("throws HttpError when not ready", async () => {
    const mockFetch = async () => errorResponse(503, "not ready");
    const client = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.readiness()).rejects.toThrow(HttpError);
  });
});

describe("CloudClient.client", () => {
  it("returns a Client scoped to the instance", async () => {
    const devices = [{ src: 1, manufacturer: "Garmin" }];

    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("https://cloud.example.com/instances/boat-1/devices");
      return jsonResponse(devices);
    };

    const cloud = new CloudClient("https://cloud.example.com", {
      fetch: mockFetch as typeof fetch,
    });
    const inst = cloud.client("boat-1");
    const result = await inst.devices();
    expect(result).toHaveLength(1);
  });
});
