import type { ChildProcess } from 'node:child_process';
import { AiError } from './errors';
import { killTree } from './process';

export interface JsonRpcMessage {
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface JsonRpcOptions {
  /** A single line longer than this aborts the session (a runaway or hostile peer). */
  maxLineBytes?: number;
  /** Total bytes read from stdout. */
  maxTotalBytes?: number;
  onNotification?: (method: string, params: unknown) => void;
  /**
   * Called for requests FROM the server (approvals, tool calls, elicitations). The default and the only
   * safe policy for analytics prompts is to refuse; the caller is told so it can abort the turn.
   */
  onServerRequest?: (method: string, params: unknown) => void;
  /** The session ended (process exit, protocol violation, or close()). Lets callers fail work that waits on notifications. */
  onClose?: (error: AiError) => void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Minimal JSON-RPC 2.0 client over a child's stdio (newline-delimited JSON), as used by `codex app-server`.
 * Correlates responses by id, enforces per-request timeouts, bounded buffers, cancellation and cleanup.
 * Raw provider messages are never exposed outside this class except as parsed notifications.
 */
export class JsonRpcClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private buffer = '';
  private total = 0;
  private closed = false;
  private closeError: AiError | null = null;
  private readonly exited: Promise<void>;
  private readonly maxLine: number;
  private readonly maxTotal: number;

  constructor(
    private readonly child: ChildProcess,
    private readonly options: JsonRpcOptions = {},
  ) {
    this.maxLine = options.maxLineBytes ?? 1024 * 1024;
    this.maxTotal = options.maxTotalBytes ?? 8 * 1024 * 1024;
    this.exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      child.once('close', () => resolve());
      child.once('error', () => resolve());
    });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.onData(chunk));
    child.stderr?.on('data', () => {
      // stderr may contain secrets; drain it so the child never blocks, and discard it.
    });
    child.stdin?.on('error', () => {
      // peer closed stdin
    });
    child.on('error', () => this.fail(new AiError('CLI_NOT_FOUND')));
    child.on('close', () => this.fail(new AiError('PROVIDER_ERROR')));
  }

  get isClosed(): boolean {
    return this.closed;
  }

  request<T = unknown>(method: string, params: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    if (this.closed) return Promise.reject(this.closeError ?? new AiError('PROVIDER_ERROR'));
    if (signal?.aborted) return Promise.reject(new AiError('CANCELLED'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AiError('TIMEOUT'));
      }, timeoutMs);
      const onAbort = () => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new AiError('CANCELLED'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve: (v) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(v as T);
        },
        reject: (e) => {
          signal?.removeEventListener('abort', onAbort);
          reject(e);
        },
        timer,
      });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params });
  }

  /** Stops the process tree, fails anything still pending, and resolves once the process has actually exited. */
  close(): Promise<void> {
    this.fail(new AiError('CANCELLED'));
    killTree(this.child);
    return Promise.race([this.exited, new Promise<void>((r) => setTimeout(r, 3000))]);
  }

  private write(message: JsonRpcMessage): void {
    if (this.closed) return;
    try {
      this.child.stdin?.write(`${JSON.stringify(message)}\n`);
    } catch {
      this.fail(new AiError('PROVIDER_ERROR'));
    }
  }

  private onData(chunk: string): void {
    this.total += Buffer.byteLength(chunk);
    if (this.total > this.maxTotal) {
      this.abort('PROVIDER_ERROR');
      return;
    }
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > this.maxLine) {
        this.abort('PROVIDER_ERROR');
        return;
      }
      if (line) this.handleLine(line);
    }
    if (Buffer.byteLength(this.buffer) > this.maxLine) this.abort('PROVIDER_ERROR');
  }

  private handleLine(line: string): void {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line) as JsonRpcMessage;
    } catch {
      this.abort('INVALID_RESPONSE');
      return;
    }
    if (typeof msg !== 'object' || msg === null) {
      this.abort('INVALID_RESPONSE');
      return;
    }
    if (msg.id !== undefined && msg.method === undefined && (msg.result !== undefined || msg.error)) {
      const entry = typeof msg.id === 'number' ? this.pending.get(msg.id) : undefined;
      if (!entry) return; // unsolicited or late response
      this.pending.delete(msg.id as number);
      clearTimeout(entry.timer);
      if (msg.error) {
        const err = new AiError('PROVIDER_ERROR');
        // Keep only the numeric code for classification; the message is never surfaced.
        (err as AiError & { rpcCode?: number; rpcMessage?: string }).rpcCode = msg.error.code;
        (err as AiError & { rpcMessage?: string }).rpcMessage = String(msg.error.message ?? '').slice(0, 300);
        entry.reject(err);
      } else entry.resolve(msg.result);
      return;
    }
    if (msg.method !== undefined && msg.id !== undefined) {
      // A request FROM the server. Refuse it (JSON-RPC "method not found") and tell the caller.
      this.write({ id: msg.id, error: { code: -32601, message: 'Not supported by this client' } });
      this.options.onServerRequest?.(msg.method, msg.params);
      return;
    }
    if (msg.method !== undefined) this.options.onNotification?.(msg.method, msg.params);
  }

  private abort(code: 'PROVIDER_ERROR' | 'INVALID_RESPONSE'): void {
    this.fail(new AiError(code));
    killTree(this.child);
  }

  private fail(error: AiError): void {
    if (this.closed) return;
    this.closed = true;
    this.closeError = error;
    this.options.onClose?.(error);
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }
}

/** The provider's own error text attached to a rejected request, for classification only. */
export function rpcFailureText(error: unknown): string {
  const e = error as { rpcMessage?: string } | undefined;
  return e?.rpcMessage ?? '';
}
