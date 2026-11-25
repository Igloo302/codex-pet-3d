import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import type { StandardAnimationState } from "@codex-pet-3d/spec";

const CANONICAL_STATES = new Set<StandardAnimationState>([
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
]);

const STATE_ALIASES: Record<string, StandardAnimationState> = {
  working: "running",
  coding: "running",
  thinking: "running",
  executing: "running",
  busy: "running",
  approval: "waiting",
  input: "waiting",
  pending: "waiting",
  paused: "waiting",
  reviewing: "review",
  diff: "review",
  inspect: "review",
  success: "jumping",
  done: "jumping",
  completed: "jumping",
  celebrate: "jumping",
  error: "failed",
  fail: "failed",
  crashed: "failed",
  greet: "waving",
  hello: "waving",
  start: "waving",
  ready: "idle",
  stopped: "idle",
};

const ONE_SHOT_STATES = new Set<StandardAnimationState>(["waving", "jumping", "failed"]);

export interface CodexStateEvent {
  state: StandardAnimationState;
  source: string;
  message?: string;
  updatedAt: number;
  ttlMs?: number;
}

export interface CodexSyncStatus {
  enabled: boolean;
  state: StandardAnimationState;
  source: string;
  updatedAt: number;
  httpPort: number | null;
}

export interface CodexSyncOptions {
  /** Path to state JSON file watched for hook/script updates (e.g. ~/.codex/pet-3d-state.json). */
  stateFilePath: string;
  /** Optional ~/.codex directory for passive activity detection when no explicit hook event is active. */
  codexHomeDir?: string;
  /** Loopback HTTP port (0 = ephemeral, null = disabled). Defaults to 47321. */
  httpPort?: number | null;
  /** Polling interval in ms for state file + Codex activity fallback. Defaults to 1000ms. */
  pollIntervalMs?: number;
  /** Default TTL for explicit non-idle looping states before falling back to idle. Defaults to 60000ms. */
  defaultTtlMs?: number;
  /** Inactivity window for passive Codex file activity detection. Defaults to 6000ms. */
  activityWindowMs?: number;
  /** Initial enabled flag. Defaults to true. */
  enabled?: boolean;
  /** Callback fired whenever synced state changes. */
  onStateChange: (event: CodexStateEvent) => void;
}

/**
 * Normalizes a canonical state or friendly hook alias (e.g. "working", "approval", "success", "error").
 */
export function normalizePetState(rawState: unknown): StandardAnimationState | null {
  if (typeof rawState !== "string") return null;
  const trimmed = rawState.trim().toLowerCase();
  if (CANONICAL_STATES.has(trimmed as StandardAnimationState)) {
    return trimmed as StandardAnimationState;
  }
  return STATE_ALIASES[trimmed] ?? null;
}

/**
 * Parses an untrusted JSON payload from the state file or HTTP endpoint.
 */
export function parseStatePayload(
  raw: unknown,
  defaultSource = "external",
  now = Date.now()
): CodexStateEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const state = normalizePetState(obj.state ?? obj.event ?? obj.status);
  if (!state) return null;

  const source =
    typeof obj.source === "string" && obj.source.trim().length > 0
      ? obj.source.trim().slice(0, 64)
      : defaultSource;

  const message =
    typeof obj.message === "string" && obj.message.trim().length > 0
      ? obj.message.trim().slice(0, 200)
      : undefined;

  const updatedAt =
    typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt) && obj.updatedAt > 0
      ? obj.updatedAt
      : now;

  const ttlMs =
    typeof obj.ttlMs === "number" && Number.isFinite(obj.ttlMs) && obj.ttlMs >= 0
      ? obj.ttlMs
      : undefined;

  return { state, source, message, updatedAt, ttlMs };
}

const MAX_HTTP_BODY_BYTES = 8 * 1024;

/**
 * Synchronizes desktop pet animation state with Codex / Claude Code / local developer tools
 * via three complementary channels:
 * 1. Local loopback HTTP bridge (`POST http://127.0.0.1:<port>/state`)
 * 2. Watched JSON state file (`~/.codex/pet-3d-state.json`)
 * 3. Optional passive Codex activity heuristic (`~/.codex/logs_2.sqlite-wal` / `state_5.sqlite-wal`)
 */
export class CodexSyncService {
  private readonly stateFilePath: string;
  private readonly codexHomeDir?: string;
  private readonly requestedPort: number | null;
  private readonly pollIntervalMs: number;
  private readonly defaultTtlMs: number;
  private readonly activityWindowMs: number;
  private readonly onStateChange: (event: CodexStateEvent) => void;

  private enabled: boolean;
  private server: http.Server | null = null;
  private boundPort: number | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastFileMtimeMs = 0;
  private lastExplicitEvent: CodexStateEvent | null = null;
  private currentState: StandardAnimationState = "idle";
  private currentSource = "idle";
  private currentUpdatedAt = 0;
  private lastObservedActivityMtimeMs = 0;

  constructor(options: CodexSyncOptions) {
    this.stateFilePath = options.stateFilePath;
    this.codexHomeDir = options.codexHomeDir;
    this.requestedPort = options.httpPort === undefined ? 47321 : options.httpPort;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
    this.activityWindowMs = options.activityWindowMs ?? 6_000;
    this.enabled = options.enabled ?? true;
    this.onStateChange = options.onStateChange;
  }

  async start(): Promise<void> {
    this.seedInitialActivityBaseline();
    this.pollOnce();

    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => this.pollOnce(), this.pollIntervalMs);
    }

    if (this.requestedPort !== null && !this.server) {
      await this.startHttpBridge(this.requestedPort);
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.server) {
      const activeServer = this.server;
      this.server = null;
      this.boundPort = null;
      await new Promise<void>((resolve) => {
        activeServer.close(() => resolve());
      });
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.pollOnce();
    }
  }

  getStatus(): CodexSyncStatus {
    return {
      enabled: this.enabled,
      state: this.currentState,
      source: this.currentSource,
      updatedAt: this.currentUpdatedAt,
      httpPort: this.boundPort,
    };
  }

  /**
   * Applies an explicit state update (e.g., from HTTP bridge or state file).
   */
  applyExternalEvent(event: CodexStateEvent): void {
    this.lastExplicitEvent = event;
    if (!this.enabled) return;
    this.emitState(event, true);
  }

  private emitState(event: CodexStateEvent, forceOneShot = false): void {
    const isOneShot = ONE_SHOT_STATES.has(event.state);
    if (
      !forceOneShot &&
      this.currentState === event.state &&
      this.currentSource === event.source
    ) {
      return;
    }

    this.currentState = event.state;
    this.currentSource = event.source;
    this.currentUpdatedAt = event.updatedAt;
    this.onStateChange(event);

    // One-shot animations automatically return to idle inside PetStateMachine.
    if (isOneShot) {
      this.currentState = "idle";
    }
  }

  private seedInitialActivityBaseline(): void {
    const latest = this.readCodexActivityMtimeMs();
    if (latest > 0) {
      this.lastObservedActivityMtimeMs = latest;
    }
  }

  private readCodexActivityMtimeMs(): number {
    if (!this.codexHomeDir) return 0;
    const candidates = [
      path.join(this.codexHomeDir, "logs_2.sqlite-wal"),
      path.join(this.codexHomeDir, "state_5.sqlite-wal"),
      path.join(this.codexHomeDir, "session_index.jsonl"),
    ];
    let latest = 0;
    for (const candidate of candidates) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.mtimeMs > latest) {
          latest = stat.mtimeMs;
        }
      } catch {
        // Ignore missing optional Codex files
      }
    }
    return latest;
  }

  /**
   * Checks state file updates, TTL expiration, and passive Codex activity.
   */
  pollOnce(now = Date.now()): void {
    // 1. Check watched JSON state file
    try {
      const stat = fs.statSync(this.stateFilePath);
      if (stat.mtimeMs > this.lastFileMtimeMs) {
        this.lastFileMtimeMs = stat.mtimeMs;
        const parsed = JSON.parse(fs.readFileSync(this.stateFilePath, "utf-8")) as unknown;
        const event = parseStatePayload(parsed, "state-file", now);
        if (event) {
          this.applyExternalEvent(event);
          return;
        }
      }
    } catch {
      // Missing or transiently mid-write state file is expected
    }

    if (!this.enabled) return;

    // 2. Respect active explicit event until its TTL expires
    if (this.lastExplicitEvent) {
      const ttl = this.lastExplicitEvent.ttlMs ?? this.defaultTtlMs;
      const isActiveExplicit =
        this.lastExplicitEvent.state !== "idle" &&
        !ONE_SHOT_STATES.has(this.lastExplicitEvent.state) &&
        (ttl === 0 || now - this.lastExplicitEvent.updatedAt < ttl);

      if (isActiveExplicit) {
        return;
      }

      // Expired explicit looping state -> gracefully return to idle
      if (
        this.currentState !== "idle" &&
        this.currentSource === this.lastExplicitEvent.source
      ) {
        this.lastExplicitEvent = null;
        this.emitState({ state: "idle", source: "ttl-expired", updatedAt: now });
        return;
      }
    }

    // 3. Passive Codex activity detection fallback
    const latestActivity = this.readCodexActivityMtimeMs();
    if (latestActivity > this.lastObservedActivityMtimeMs) {
      this.lastObservedActivityMtimeMs = latestActivity;
    }

    const isRecentlyActive =
      this.lastObservedActivityMtimeMs > 0 &&
      now - this.lastObservedActivityMtimeMs <= this.activityWindowMs &&
      // Only treat as live activity if it happened after service started or within window
      latestActivity > 0 &&
      now - latestActivity <= this.activityWindowMs;

    if (isRecentlyActive && latestActivity > 0) {
      if (this.currentState === "idle" && latestActivity >= now - this.activityWindowMs) {
        // Avoid triggering solely from pre-existing startup baseline unless file updated since baseline
        if (latestActivity > this.currentUpdatedAt) {
          this.emitState({
            state: "running",
            source: "codex-activity",
            updatedAt: now,
          });
        }
      }
    } else if (this.currentSource === "codex-activity" && this.currentState !== "idle") {
      this.emitState({
        state: "idle",
        source: "codex-activity",
        updatedAt: now,
      });
    }
  }

  private startHttpBridge(port: number): Promise<void> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      server.once("error", () => {
        // Port already in use or restricted — keep file watcher running without crashing app
        this.server = null;
        this.boundPort = null;
        resolve();
      });

      server.listen(port, "127.0.0.1", () => {
        const addr = server.address();
        this.server = server;
        this.boundPort = typeof addr === "object" && addr ? addr.port : port;
        resolve();
      });
    });
  }

  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const sendJson = (statusCode: number, body: unknown) => {
      res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(body));
    };

    const urlPath = (req.url ?? "/").split("?")[0];

    if (req.method === "GET" && (urlPath === "/health" || urlPath === "/state")) {
      sendJson(200, { ok: true, ...this.getStatus() });
      return;
    }

    if (req.method === "POST" && urlPath === "/state") {
      let bytes = 0;
      const chunks: Buffer[] = [];
      let aborted = false;

      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_HTTP_BODY_BYTES) {
          aborted = true;
          sendJson(413, { ok: false, error: "Payload too large" });
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (aborted) return;
        try {
          const text = Buffer.concat(chunks).toString("utf-8");
          const parsed = JSON.parse(text) as unknown;
          const event = parseStatePayload(parsed, "http-bridge");
          if (!event) {
            sendJson(400, {
              ok: false,
              error:
                "Invalid state payload. Expected JSON with state (e.g. idle, running, waiting, review, jumping, waving, failed).",
            });
            return;
          }
          this.applyExternalEvent(event);
          sendJson(200, { ok: true, event, enabled: this.enabled });
        } catch {
          sendJson(400, { ok: false, error: "Invalid JSON body" });
        }
      });
      return;
    }

    sendJson(404, { ok: false, error: "Not found" });
  }
}
