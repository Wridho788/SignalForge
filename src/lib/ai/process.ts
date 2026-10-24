import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export interface SpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

/** Spawns WITHOUT a shell, with an explicit working directory and environment. Never interpolates strings into a command line. */
export function spawnChild(spec: SpawnSpec): ChildProcess {
  return spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32', // own process group on POSIX so the whole tree can be killed
  });
}

/** Terminates the child and any processes it started. Safe to call repeatedly. */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    if (process.platform === 'win32') {
      const root = process.env.SystemRoot ?? 'C:\\Windows';
      const killer = spawn(path.join(root, 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('error', () => child.kill());
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
}

export interface BoundedRun {
  spec: SpawnSpec;
  /** Written to stdin, then stdin is closed. */
  input?: string;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  signal?: AbortSignal;
}

export interface BoundedResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  /** Output exceeded a limit and the process was stopped. */
  truncated: boolean;
  /** The program could not be started at all (e.g. ENOENT). */
  spawnFailed: boolean;
}

/** Runs a program to completion with a timeout, output caps, cancellation and tree cleanup. */
export function runBounded(run: BoundedRun): Promise<BoundedResult> {
  return new Promise((resolve) => {
    const result: BoundedResult = { exitCode: null, stdout: '', stderr: '', timedOut: false, aborted: false, truncated: false, spawnFailed: false };
    let child: ChildProcess;
    try {
      child = spawnChild(run.spec);
    } catch {
      resolve({ ...result, spawnFailed: true });
      return;
    }

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      run.signal?.removeEventListener('abort', onAbort);
      result.stdout = Buffer.concat(out).toString('utf8');
      result.stderr = Buffer.concat(err).toString('utf8');
      resolve(result);
    };

    const stop = () => killTree(child);
    const timer = setTimeout(() => {
      result.timedOut = true;
      stop();
    }, run.timeoutMs);
    const onAbort = () => {
      result.aborted = true;
      stop();
    };
    if (run.signal?.aborted) onAbort();
    else run.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => {
      outBytes += chunk.length;
      if (outBytes > run.maxStdoutBytes) {
        result.truncated = true;
        stop();
        return;
      }
      out.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      errBytes += chunk.length;
      if (errBytes > run.maxStderrBytes) {
        // stderr is only ever classified, never shown; keep what fits and carry on.
        return;
      }
      err.push(chunk);
    });
    child.on('error', () => {
      result.spawnFailed = true;
      finish();
    });
    child.on('close', (code) => {
      result.exitCode = code;
      finish();
    });

    child.stdin?.on('error', () => {
      // EPIPE when the child exits before reading stdin: not an error for us.
    });
    if (run.input !== undefined) child.stdin?.end(run.input);
    else child.stdin?.end();
  });
}
