import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CodexSyncService,
  normalizePetState,
  parseStatePayload,
  type CodexStateEvent,
} from "../src/codex-sync";

describe("codex-sync", () => {
  let tmpDir: string;
  let stateFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-pet-sync-"));
    stateFile = path.join(tmpDir, "pet-3d-state.json");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("normalizes canonical states and common agent hook aliases", () => {
    expect(normalizePetState("running")).toBe("running");
    expect(normalizePetState("working")).toBe("running");
    expect(normalizePetState("approval")).toBe("waiting");
    expect(normalizePetState("success")).toBe("jumping");
    expect(normalizePetState("error")).toBe("failed");
    expect(normalizePetState("reviewing")).toBe("review");
    expect(normalizePetState("unknown-xyz")).toBeNull();
  });

  it("watches the JSON state file and expires looping states after TTL", async () => {
    const events: CodexStateEvent[] = [];
    const service = new CodexSyncService({
      stateFilePath: stateFile,
      httpPort: null,
      pollIntervalMs: 60_000,
      defaultTtlMs: 5000,
      onStateChange: (e) => events.push(e),
    });

    await service.start();
    try {
      const t0 = Date.now();
      fs.writeFileSync(
        stateFile,
        JSON.stringify({ state: "working", source: "codex-hook", updatedAt: t0, ttlMs: 2000 })
      );
      service.pollOnce(t0 + 100);

      expect(events).toHaveLength(1);
      expect(events[0].state).toBe("running");
      expect(events[0].source).toBe("codex-hook");

      // After TTL expires, falls back to idle
      service.pollOnce(t0 + 3000);
      expect(events).toHaveLength(2);
      expect(events[1].state).toBe("idle");
    } finally {
      await service.stop();
    }
  });

  it("accepts state updates via the local loopback HTTP bridge", async () => {
    const onStateChange = vi.fn();
    const service = new CodexSyncService({
      stateFilePath: stateFile,
      httpPort: 0, // Ephemeral port for test isolation
      pollIntervalMs: 60_000,
      onStateChange,
    });

    await service.start();
    try {
      const port = service.getStatus().httpPort;
      expect(port).toBeTruthy();

      const res = await fetch(`http://127.0.0.1:${port}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "review", source: "claude-hook" }),
      });
      expect(res.status).toBe(200);
      expect(onStateChange).toHaveBeenCalledTimes(1);
      expect(onStateChange.mock.calls[0][0].state).toBe("review");

      const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
      const health = (await healthRes.json()) as { ok: boolean; state: string; source: string };
      expect(health.ok).toBe(true);
      expect(health.state).toBe("review");
      expect(health.source).toBe("claude-hook");

      const badRes = await fetch(`http://127.0.0.1:${port}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "not-a-state" }),
      });
      expect(badRes.status).toBe(400);
    } finally {
      await service.stop();
    }
  });

  it("parses valid payloads and rejects malformed ones", () => {
    expect(parseStatePayload({ event: "done", source: "ci" })?.state).toBe("jumping");
    expect(parseStatePayload(null)).toBeNull();
    expect(parseStatePayload({ state: 42 })).toBeNull();
  });
});
