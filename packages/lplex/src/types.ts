/** A single CAN frame received from the lplex server. */
export interface Frame {
  seq: number;
  ts: string;
  prio: number;
  pgn: number;
  src: number;
  dst: number;
  data: string;
}

/** An NMEA 2000 device discovered on the bus. */
export interface Device {
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

/** Discriminated union for SSE events. */
export type Event =
  | { type: "frame"; frame: Frame }
  | { type: "device"; device: Device };

/**
 * Filter for CAN frames.
 * Categories are AND'd, values within a category are OR'd.
 */
export interface Filter {
  pgn?: number[];
  manufacturer?: string[];
  instance?: number[];
  name?: string[];
}

/** Configuration for creating a buffered session. */
export interface SessionConfig {
  clientId: string;
  bufferTimeout: string;
  filter?: Filter;
}

/** Server response from creating or reconnecting a session. */
export interface SessionInfo {
  client_id: string;
  seq: number;
  cursor: number;
  devices: Device[];
}

/** Parameters for transmitting a CAN frame. */
export interface SendParams {
  pgn: number;
  src: number;
  dst: number;
  prio: number;
  data: string;
}

// --- Cloud types ---

/** Summary of a cloud instance, returned by GET /instances. */
export interface InstanceSummary {
  id: string;
  connected: boolean;
  cursor: number;
  boat_head_seq: number;
  holes: number;
  lag_seqs: number;
  last_seen: string;
}

/** A sequence range representing a gap in the replication stream. */
export interface SeqRange {
  start: number;
  end: number;
}

/** Detailed replication status for one instance. */
export interface InstanceStatus {
  id: string;
  connected: boolean;
  cursor: number;
  boat_head_seq: number;
  boat_journal_bytes: number;
  holes: SeqRange[];
  lag_seqs: number;
  last_seen: string;
}

/** Event types emitted by the replication pipeline. */
export type ReplicationEventType =
  | "live_start"
  | "live_stop"
  | "backfill_start"
  | "backfill_stop"
  | "block_received"
  | "checkpoint";

/** A single diagnostic event from the replication pipeline. */
export interface ReplicationEvent {
  time: string;
  type: ReplicationEventType;
  detail?: Record<string, unknown>;
}
