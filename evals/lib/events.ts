import { resolve } from "node:path";

interface EventEvidenceOptions {
  maxResultChars?: number;
}

interface TimelineEntry {
  sequence: number;
  completionSequence?: number;
  toolCallId: string;
  toolName: string;
  args: unknown;
  isError?: boolean;
  resultText: string;
}

function resultText(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((item): item is { type: "text"; text: string } => Boolean(item) && typeof item === "object" && (item as any).type === "text" && typeof (item as any).text === "string")
    .map((item) => item.text)
    .join("");
}

export class EventEvidence {
  #skillPath: string;
  #skillRoot: string;
  #maxResultChars: number;
  #pending = new Map<string, TimelineEntry>();
  #timeline: TimelineEntry[] = [];
  #sequence = 1;
  #skillEntrypointReads = 0;
  #skillTreeReads = 0;
  #failedReads = 0;
  #finalText = "";
  #provider?: string;
  #model?: string;
  #usage?: unknown;
  #stopReason?: string;
  #errorMessage?: string;

  constructor(skillPath: string, options: EventEvidenceOptions = {}) {
    this.#skillPath = resolve(skillPath);
    this.#skillRoot = resolve(this.#skillPath, "..");
    this.#maxResultChars = options.maxResultChars ?? 2000;
  }

  consume(event: any) {
    if (!event || typeof event !== "object") return;
    if (event.type === "tool_execution_start") {
      const entry: TimelineEntry = {
        sequence: this.#sequence++,
        toolCallId: String(event.toolCallId ?? ""),
        toolName: String(event.toolName ?? ""),
        args: structuredClone(event.args),
        resultText: "",
      };
      this.#pending.set(entry.toolCallId, entry);
      this.#timeline.push(entry);
      return;
    }
    if (event.type === "tool_execution_end") {
      const id = String(event.toolCallId ?? "");
      const entry = this.#pending.get(id);
      if (!entry) return;
      entry.isError = Boolean(event.isError);
      entry.completionSequence = this.#sequence++;
      const text = resultText(event.result);
      if (text.length <= this.#maxResultChars) entry.resultText = text;
      else if (entry.toolName === "bash") {
        const head = Math.floor(this.#maxResultChars / 2);
        entry.resultText = `${text.slice(0, head)}…${text.slice(-(this.#maxResultChars - head))}`;
      } else entry.resultText = `${text.slice(0, this.#maxResultChars)}…`;
      this.#pending.delete(id);
      if (entry.toolName === "read") this.#recordRead(entry);
      return;
    }
    if (event.type === "message_end" && event.message?.role === "assistant" && Array.isArray(event.message.content)) {
      this.#finalText = event.message.content
        .filter((part: any) => part?.type === "text" && typeof part.text === "string")
        .map((part: any) => part.text)
        .join("");
      this.#provider = event.message.provider;
      this.#model = event.message.model;
      this.#usage = event.message.usage ? structuredClone(event.message.usage) : undefined;
      this.#stopReason = event.message.stopReason;
      this.#errorMessage = event.message.errorMessage;
    }
  }

  summary() {
    return {
      skillLoaded: this.#skillEntrypointReads > 0,
      skillEntrypointReads: this.#skillEntrypointReads,
      skillTreeReads: this.#skillTreeReads,
      failedReads: this.#failedReads,
      finalText: this.#finalText,
      provider: this.#provider,
      model: this.#model,
      usage: this.#usage,
      stopReason: this.#stopReason,
      errorMessage: this.#errorMessage,
      timeline: structuredClone(this.#timeline),
    };
  }

  #recordRead(entry: TimelineEntry) {
    if (entry.isError) {
      this.#failedReads += 1;
      return;
    }
    const path = entry.args && typeof entry.args === "object" ? (entry.args as { path?: unknown }).path : undefined;
    if (typeof path !== "string") return;
    const resolved = resolve(path);
    if (resolved === this.#skillPath) this.#skillEntrypointReads += 1;
    if (resolved === this.#skillRoot || resolved.startsWith(`${this.#skillRoot}/`)) this.#skillTreeReads += 1;
  }
}
