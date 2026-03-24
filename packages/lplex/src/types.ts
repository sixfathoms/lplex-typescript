/** A single CAN frame received from the lplex server. */
export interface Frame {
  seq: number;
  ts: string;
  bus?: string;
  prio: number;
  pgn: number;
  src: number;
  dst: number;
  data: string;
  decoded?: Record<string, unknown>;
}

/** An NMEA 2000 device discovered on the bus. */
export interface Device {
  bus?: string;
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

/** A device-removed notification from the bus. */
export interface DeviceRemoved {
  type: "device_removed";
  bus?: string;
  src: number;
}

/** Discriminated union for SSE events. */
export type Event =
  | { type: "frame"; frame: Frame }
  | { type: "device"; device: Device }
  | { type: "device_removed"; deviceRemoved: DeviceRemoved };

/**
 * Filter for CAN frames.
 * Categories are AND'd, values within a category are OR'd.
 */
export interface Filter {
  pgn?: number[];
  exclude_pgn?: number[];
  manufacturer?: string[];
  instance?: number[];
  name?: string[];
  exclude_name?: string[];
  bus?: string[];
}

/** Options for ephemeral SSE subscription. */
export interface SubscribeOptions {
  filter?: Filter;
  /** When true, frames include decoded field values. */
  decode?: boolean;
  signal?: AbortSignal;
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
  bus?: string;
}

// --- Values types ---

/** A single PGN's last-known value for a device. */
export interface PGNValue {
  pgn: number;
  ts: string;
  data: string;
  seq: number;
}

/** Last-known values grouped by device. */
export interface DeviceValues {
  name: string;
  src: number;
  manufacturer?: string;
  model_id?: string;
  values: PGNValue[];
}

/** A single PGN's decoded value for a device. */
export interface DecodedPGNValue {
  pgn: number;
  ts: string;
  data: string;
  seq: number;
  decoded: Record<string, unknown>;
}

/** Decoded values grouped by device. */
export interface DecodedDeviceValues {
  name: string;
  src: number;
  manufacturer?: string;
  model_id?: string;
  values: DecodedPGNValue[];
}

/** Parameters for an ISO Request query (POST /query). */
export interface QueryParams {
  pgn: number;
  /** Destination address. Defaults to 0xFF (broadcast) on the server. */
  dst?: number;
  timeout?: string;
  bus?: string;
}

/** Parameters for historical data query (GET /history). */
export interface HistoryParams {
  /** Start timestamp (RFC 3339). */
  from: string;
  /** End timestamp (RFC 3339). Defaults to now. */
  to?: string;
  /** Filter by PGN(s). */
  pgn?: number[];
  /** Filter by source address(es). */
  src?: number[];
  /** Max frames to return. Defaults to 10000. */
  limit?: number;
  /** Downsample interval (e.g. "1s", "PT1M"). */
  interval?: string;
  /** Include decoded values in response. */
  decode?: boolean;
}

// --- Health types ---

/** Broker health details. */
export interface BrokerHealth {
  status: string;
  frames_total: number;
  head_seq: number;
  last_frame_time: string;
  device_count: number;
  ring_entries: number;
  ring_capacity: number;
}

/** Replication component health (within health response). */
export interface ReplicationHealth {
  status: string;
  connected: boolean;
  live_lag: number;
  backfill_remaining_seqs: number;
  last_ack: string;
}

/** Health check response from GET /healthz or /readyz. */
export interface HealthStatus {
  status: string;
  broker?: BrokerHealth;
  replication?: ReplicationHealth;
  components?: Record<string, unknown>;
  /** Cloud-only: total known instances. */
  instances_total?: number;
  /** Cloud-only: currently connected instances. */
  instances_connected?: number;
}

/** Boat-side replication status from GET /replication/status. */
export interface ReplicationStatus {
  connected: boolean;
  instance_id: string;
  local_head_seq: number;
  cloud_cursor: number;
  holes: SeqRange[];
  live_lag: number;
  backfill_remaining_seqs: number;
  last_ack: string;
  live_frames_sent: number;
  backfill_blocks_sent: number;
  backfill_bytes_sent: number;
  reconnects: number;
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
