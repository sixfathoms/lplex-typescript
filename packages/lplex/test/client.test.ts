import { describe, expect, it } from "vitest";
import { Client } from "../src/client.js";
import { HttpError } from "../src/errors.js";

const sampleFrame = {
  seq: 1,
  ts: "2026-02-28T12:00:00Z",
  prio: 6,
  pgn: 129025,
  src: 1,
  dst: 255,
  data: "00aabbcc",
};

const sampleDevice = {
  type: "device",
  src: 1,
  name: "0x00deadbeef123456",
  manufacturer: "Garmin",
  manufacturer_code: 229,
  device_class: 25,
  device_function: 130,
  device_instance: 0,
  unique_number: 12345,
  model_id: "GPS 19x",
  software_version: "1.0",
  model_version: "1.0",
  model_serial: "",
  product_code: 100,
  first_seen: "2026-02-28T12:00:00Z",
  last_seen: "2026-02-28T12:00:01Z",
  packet_count: 100,
  byte_count: 800,
};

function sseResponse(lines: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

describe("Client.values", () => {
  it("fetches and returns last-known values", async () => {
    const values = [
      {
        name: "0x00deadbeef123456",
        src: 1,
        manufacturer: "Garmin",
        model_id: "GPS 19x",
        values: [
          {
            pgn: 129025,
            ts: "2026-03-04T10:00:00Z",
            data: "aabbccdd",
            seq: 100,
          },
        ],
      },
    ];
    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("http://localhost:8089/values");
      return jsonResponse(values);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.values();
    expect(result).toHaveLength(1);
    expect(result[0].src).toBe(1);
    expect(result[0].manufacturer).toBe("Garmin");
    expect(result[0].values).toHaveLength(1);
    expect(result[0].values[0].pgn).toBe(129025);
    expect(result[0].values[0].data).toBe("aabbccdd");
  });

  it("returns empty array when no values", async () => {
    const mockFetch = async () => jsonResponse([]);
    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.values();
    expect(result).toEqual([]);
  });

  it("encodes filter as query params", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return jsonResponse([]);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.values({ pgn: [129025, 129026], manufacturer: ["Garmin"] });

    const parsed = new URL(capturedURL);
    expect(parsed.searchParams.getAll("pgn")).toEqual(["129025", "129026"]);
    expect(parsed.searchParams.getAll("manufacturer")).toEqual(["Garmin"]);
  });

  it("omits query string when filter is empty", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return jsonResponse([]);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.values({});
    expect(capturedURL).toBe("http://localhost:8089/values");
  });

  it("omits query string when no filter", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return jsonResponse([]);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.values();
    expect(capturedURL).toBe("http://localhost:8089/values");
  });

  it("throws HttpError on non-200", async () => {
    const mockFetch = async () => errorResponse(500, "internal error");
    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.values()).rejects.toThrow(HttpError);
  });
});

describe("Client.devices", () => {
  it("fetches and returns the device list", async () => {
    const devices = [{ ...sampleDevice }];
    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("http://localhost:8089/devices");
      return jsonResponse(devices);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.devices();
    expect(result).toHaveLength(1);
    expect(result[0].manufacturer).toBe("Garmin");
  });

  it("throws HttpError on non-200", async () => {
    const mockFetch = async () => errorResponse(500, "internal error");
    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.devices()).rejects.toThrow(HttpError);
  });
});

describe("Client.subscribe", () => {
  it("opens an ephemeral SSE stream", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      expect(String(url)).toBe("http://localhost:8089/events");
      return sseResponse(`data: ${JSON.stringify(sampleFrame)}\n\n`);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const stream = await client.subscribe();
    const events = [];
    for await (const event of stream) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("frame");
  });

  it("encodes filter as query params", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return sseResponse("");
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.subscribe({ pgn: [129025, 129026], manufacturer: ["Garmin"] });

    const parsed = new URL(capturedURL);
    expect(parsed.searchParams.getAll("pgn")).toEqual(["129025", "129026"]);
    expect(parsed.searchParams.getAll("manufacturer")).toEqual(["Garmin"]);
  });

  it("omits query string when filter is empty", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return sseResponse("");
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.subscribe({});
    expect(capturedURL).toBe("http://localhost:8089/events");
  });
});

describe("Client.send", () => {
  it("sends a CAN frame", async () => {
    let capturedBody = "";
    const mockFetch = async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedBody = init?.body as string;
      return new Response(null, { status: 202 });
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.send({ pgn: 129025, src: 0, dst: 255, prio: 6, data: "aabb" });
    const parsed = JSON.parse(capturedBody);
    expect(parsed.pgn).toBe(129025);
    expect(parsed.data).toBe("aabb");
  });

  it("throws on non-202", async () => {
    const mockFetch = async () => errorResponse(503, "tx queue full");
    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(
      client.send({ pgn: 129025, src: 0, dst: 255, prio: 6, data: "aa" }),
    ).rejects.toThrow(HttpError);
  });
});

describe("Client.createSession", () => {
  it("creates a session and returns a Session object", async () => {
    const sessionInfo = {
      client_id: "my-client",
      seq: 100,
      cursor: 0,
      devices: [],
    };

    let capturedBody = "";
    const mockFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const u = String(url);
      if (u.endsWith("/clients/my-client") && init?.method === "PUT") {
        capturedBody = init.body as string;
        return jsonResponse(sessionInfo);
      }
      return errorResponse(404, "not found");
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const session = await client.createSession({
      clientId: "my-client",
      bufferTimeout: "PT5M",
      filter: { pgn: [129025] },
    });

    expect(session.info.client_id).toBe("my-client");
    expect(session.info.seq).toBe(100);
    expect(session.lastAckedSeq).toBe(0);

    const body = JSON.parse(capturedBody);
    expect(body.buffer_timeout).toBe("PT5M");
    expect(body.filter.pgn).toEqual([129025]);
  });
});

describe("Session", () => {
  it("subscribes and receives events", async () => {
    const sessionInfo = {
      client_id: "test-session",
      seq: 50,
      cursor: 0,
      devices: [],
    };

    const mockFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const u = String(url);
      if (u.endsWith("/clients/test-session") && init?.method === "PUT") {
        return jsonResponse(sessionInfo);
      }
      if (u.endsWith("/clients/test-session/events")) {
        return sseResponse(`data: ${JSON.stringify(sampleFrame)}\n\n`);
      }
      return errorResponse(404, "not found");
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const session = await client.createSession({
      clientId: "test-session",
      bufferTimeout: "PT1M",
    });

    const stream = await session.subscribe();
    const events = [];
    for await (const event of stream) {
      events.push(event);
    }
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("frame");
  });

  it("acks a sequence number", async () => {
    const sessionInfo = {
      client_id: "ack-test",
      seq: 50,
      cursor: 0,
      devices: [],
    };

    let ackSeq = -1;
    const mockFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const u = String(url);
      if (u.endsWith("/clients/ack-test") && init?.method === "PUT") {
        return jsonResponse(sessionInfo);
      }
      if (u.endsWith("/clients/ack-test/ack") && init?.method === "PUT") {
        ackSeq = JSON.parse(init.body as string).seq;
        return new Response(null, { status: 204 });
      }
      return errorResponse(404, "not found");
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const session = await client.createSession({
      clientId: "ack-test",
      bufferTimeout: "PT1M",
    });

    await session.ack(42);
    expect(ackSeq).toBe(42);
    expect(session.lastAckedSeq).toBe(42);
  });

  it("throws HttpError when ack fails", async () => {
    const sessionInfo = {
      client_id: "fail-ack",
      seq: 50,
      cursor: 0,
      devices: [],
    };

    const mockFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const u = String(url);
      if (u.endsWith("/clients/fail-ack") && init?.method === "PUT") {
        if (u.endsWith("/ack")) {
          return errorResponse(404, "session not found");
        }
        return jsonResponse(sessionInfo);
      }
      return errorResponse(404, "not found");
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const session = await client.createSession({
      clientId: "fail-ack",
      bufferTimeout: "PT1M",
    });

    await expect(session.ack(42)).rejects.toThrow(HttpError);
  });
});

describe("Client.decodedValues", () => {
  it("fetches and returns decoded values", async () => {
    const values = [
      {
        name: "0x00deadbeef123456",
        src: 1,
        manufacturer: "Garmin",
        model_id: "GPS 19x",
        values: [
          {
            pgn: 129025,
            ts: "2026-03-04T10:00:00Z",
            data: "aabbccdd",
            seq: 100,
            decoded: { latitude: 47.6, longitude: -122.3 },
          },
        ],
      },
    ];
    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("http://localhost:8089/values/decoded");
      return jsonResponse(values);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.decodedValues();
    expect(result).toHaveLength(1);
    expect(result[0].values[0].decoded.latitude).toBe(47.6);
  });

  it("encodes filter as query params", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return jsonResponse([]);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.decodedValues({ pgn: [129025] });
    const parsed = new URL(capturedURL);
    expect(parsed.pathname).toBe("/values/decoded");
    expect(parsed.searchParams.getAll("pgn")).toEqual(["129025"]);
  });

  it("throws HttpError on non-200", async () => {
    const mockFetch = async () => errorResponse(500, "internal error");
    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.decodedValues()).rejects.toThrow(HttpError);
  });
});

describe("Client.query", () => {
  it("sends an ISO request and returns the response frame", async () => {
    const frame = { ...sampleFrame, pgn: 60928 };
    let capturedBody = "";
    const mockFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      expect(String(url)).toBe("http://localhost:8089/query");
      capturedBody = init?.body as string;
      return jsonResponse(frame);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.query({ pgn: 60928, dst: 10, timeout: "PT5S" });
    expect(result.pgn).toBe(60928);
    const body = JSON.parse(capturedBody);
    expect(body.pgn).toBe(60928);
    expect(body.dst).toBe(10);
    expect(body.timeout).toBe("PT5S");
  });

  it("throws HttpError on 504 timeout", async () => {
    const mockFetch = async () => errorResponse(504, "gateway timeout");
    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.query({ pgn: 60928, dst: 10 })).rejects.toThrow(
      HttpError,
    );
  });
});

describe("Client.health", () => {
  it("returns health status", async () => {
    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("http://localhost:8089/healthz");
      return jsonResponse({ status: "ok" });
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.health();
    expect(result.status).toBe("ok");
  });

  it("throws HttpError when unhealthy", async () => {
    const mockFetch = async () => errorResponse(503, "bus silent");
    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.health()).rejects.toThrow(HttpError);
  });
});

describe("Client.replicationStatus", () => {
  it("returns replication status", async () => {
    const status = {
      connected: true,
      instance_id: "boat-001",
      local_head_seq: 50000,
      cloud_cursor: 49950,
      holes: [{ start: 100, end: 200 }],
      live_lag: 50,
      backfill_remaining_seqs: 500,
      last_ack: "2026-03-06T10:15:30Z",
    };
    const mockFetch = async (url: string | URL | Request) => {
      expect(url).toBe("http://localhost:8089/replication/status");
      return jsonResponse(status);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    const result = await client.replicationStatus();
    expect(result.connected).toBe(true);
    expect(result.instance_id).toBe("boat-001");
    expect(result.holes).toHaveLength(1);
    expect(result.live_lag).toBe(50);
  });

  it("throws HttpError when not configured", async () => {
    const mockFetch = async () => errorResponse(404, "not found");
    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await expect(client.replicationStatus()).rejects.toThrow(HttpError);
  });
});

describe("Filter exclusions", () => {
  it("encodes exclude_pgn in query params", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return jsonResponse([]);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.values({ exclude_pgn: [59904, 60928] });

    const parsed = new URL(capturedURL);
    expect(parsed.searchParams.getAll("exclude_pgn")).toEqual([
      "59904",
      "60928",
    ]);
  });

  it("encodes exclude_name in query params", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return jsonResponse([]);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.values({ exclude_name: ["0x00deadbeef123456"] });

    const parsed = new URL(capturedURL);
    expect(parsed.searchParams.getAll("exclude_name")).toEqual([
      "0x00deadbeef123456",
    ]);
  });

  it("includes exclusion filters in session creation body", async () => {
    let capturedBody = "";
    const mockFetch = async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      if (init?.method === "PUT") {
        capturedBody = init.body as string;
        return jsonResponse({
          client_id: "excl-test",
          seq: 1,
          cursor: 0,
          devices: [],
        });
      }
      return errorResponse(404, "not found");
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.createSession({
      clientId: "excl-test",
      bufferTimeout: "PT1M",
      filter: {
        pgn: [129025],
        exclude_pgn: [59904],
        exclude_name: ["0x00deadbeef123456"],
      },
    });

    const body = JSON.parse(capturedBody);
    expect(body.filter.pgn).toEqual([129025]);
    expect(body.filter.exclude_pgn).toEqual([59904]);
    expect(body.filter.exclude_name).toEqual(["0x00deadbeef123456"]);
  });

  it("treats only-exclusion filter as non-empty", async () => {
    let capturedURL = "";
    const mockFetch = async (url: string | URL | Request) => {
      capturedURL = String(url);
      return jsonResponse([]);
    };

    const client = new Client("http://localhost:8089", {
      fetch: mockFetch as typeof fetch,
    });
    await client.values({ exclude_pgn: [59904] });
    expect(capturedURL).toContain("exclude_pgn=59904");
  });
});
