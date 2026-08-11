import { spawn } from "node:child_process";

import { matchesExpectedFailure, type RunPhase } from "./evidence.ts";

export interface EvidenceCommandInput {
  cwd: string;
  phase: RunPhase;
  command: string;
  expectedFailure?: string;
  signal?: AbortSignal;
  maxOutputBytes?: number;
}

export interface EvidenceCommandResult {
  phase: RunPhase;
  command: string;
  exitCode: number | null;
  output: string;
  durationMs: number;
  valid: boolean;
  cancelled: boolean;
  truncated: boolean;
  expectedFailure?: string;
}

function appendTail(current: Buffer, chunk: Buffer, maxBytes: number) {
  const combined = Buffer.concat([current, chunk]);
  return combined.byteLength <= maxBytes ? combined : combined.subarray(combined.byteLength - maxBytes);
}

export async function runEvidenceCommand(input: EvidenceCommandInput): Promise<EvidenceCommandResult> {
  const maxOutputBytes = input.maxOutputBytes ?? 50 * 1024;
  const started = performance.now();
  if (input.signal?.aborted) {
    return {
      phase: input.phase,
      command: input.command,
      exitCode: null,
      output: "Command cancelled before start.",
      durationMs: 0,
      valid: false,
      cancelled: true,
      truncated: false,
      expectedFailure: input.expectedFailure,
    };
  }

  return new Promise((resolve, reject) => {
    let output = Buffer.alloc(0);
    let totalBytes = 0;
    let cancelled = false;
    let settled = false;
    let forceKill: NodeJS.Timeout | undefined;
    const grouped = process.platform !== "win32";
    const child = spawn(input.command, {
      cwd: input.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: grouped,
      windowsHide: true,
    });
    const terminateTree = () => {
      cancelled = true;
      if (!child.pid) return;
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        child.kill();
        return;
      }
      try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
      forceKill = setTimeout(() => {
        try { process.kill(-child.pid!, "SIGKILL"); } catch { /* process group already exited */ }
      }, 100);
      forceKill.unref();
    };
    const onAbort = () => terminateTree();
    if (input.signal?.aborted) terminateTree();
    else input.signal?.addEventListener("abort", onAbort, { once: true });
    const collect = (chunk: Buffer | string) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += value.byteLength;
      output = appendTail(output, value, maxOutputBytes);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      if (cancelled) return;
      settled = true;
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (forceKill && !cancelled) clearTimeout(forceKill);
      input.signal?.removeEventListener("abort", onAbort);
      cancelled ||= signal !== null || Boolean(input.signal?.aborted);
      const text = output.toString("utf8");
      const expectedMatched = matchesExpectedFailure(input.expectedFailure, text);
      const valid = input.phase === "red"
        ? !cancelled && code !== null && code !== 0 && expectedMatched
        : !cancelled && code === 0;
      resolve({
        phase: input.phase,
        command: input.command,
        exitCode: code,
        output: text,
        durationMs: Math.round(performance.now() - started),
        valid,
        cancelled,
        truncated: totalBytes > maxOutputBytes,
        expectedFailure: input.expectedFailure,
      });
    });
  });
}
