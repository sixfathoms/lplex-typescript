import type { Device, DeviceRemoved, Event, Frame } from "./types.js";

/**
 * Parse an SSE stream from a fetch Response into an async iterable of Events.
 *
 * Reads "data: {json}" lines from the stream, distinguishes frame vs device
 * events by the presence of a "type" field in the JSON. Silently skips
 * malformed lines and non-data lines (comments, empty lines, event/id fields).
 */
export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Event, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (terminated by \n).
      for (
        let newlineIdx = buffer.indexOf("\n");
        newlineIdx !== -1;
        newlineIdx = buffer.indexOf("\n")
      ) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);

        if (!line.startsWith("data: ")) continue;

        const json = line.slice(6);
        let parsed: unknown;
        try {
          parsed = JSON.parse(json);
        } catch {
          continue;
        }

        if (typeof parsed !== "object" || parsed === null) continue;

        const event = classify(parsed as Record<string, unknown>);
        if (event) yield event;
      }
    }

    // Flush any remaining data in the decoder.
    buffer += decoder.decode();
    if (buffer.startsWith("data: ")) {
      const json = buffer.slice(6);
      try {
        const parsed = JSON.parse(json);
        if (typeof parsed === "object" && parsed !== null) {
          const event = classify(parsed as Record<string, unknown>);
          if (event) yield event;
        }
      } catch {
        // malformed trailing data, ignore
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function classify(obj: Record<string, unknown>): Event | null {
  if ("type" in obj) {
    if (obj.type === "device") {
      return { type: "device", device: obj as unknown as Device };
    }
    if (obj.type === "device_removed") {
      return {
        type: "device_removed",
        deviceRemoved: obj as unknown as DeviceRemoved,
      };
    }
  }
  if ("seq" in obj) {
    return { type: "frame", frame: obj as unknown as Frame };
  }
  return null;
}
