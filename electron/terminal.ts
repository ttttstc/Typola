import type { WebContents } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import { spawn, type IPty } from 'node-pty';
import type {
  TerminalCreateRequest,
  TerminalCreateResult,
  TerminalExitPayload,
} from '../src/shared/terminal';

interface TerminalRecord {
  id: number;
  pty: IPty;
}

const terminals = new Map<number, TerminalRecord>();
let nextTerminalId = 1;

function resolveTerminalCwd(cwd?: string | null) {
  if (cwd && fs.existsSync(cwd)) {
    return cwd;
  }

  return os.homedir();
}

function resolveShellPath(shell?: string | null) {
  if (shell?.trim()) {
    return shell.trim();
  }

  if (process.platform === 'win32') {
    return 'powershell.exe';
  }

  return process.env.SHELL || '/bin/bash';
}

function clampDimension(value: number | undefined, fallback: number) {
  if (!value || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(2, Math.floor(value));
}

export function createTerminal(webContents: WebContents, request: TerminalCreateRequest): TerminalCreateResult {
  const termId = nextTerminalId;
  nextTerminalId += 1;

  const shellPath = resolveShellPath(request.shell);
  const cwd = resolveTerminalCwd(request.cwd);
  const pty = spawn(shellPath, [], {
    name: 'xterm-256color',
    cwd,
    cols: clampDimension(request.cols, 80),
    rows: clampDimension(request.rows, 24),
    env: {
      ...process.env,
      TERM_PROGRAM: 'Typola',
    },
  });

  terminals.set(termId, {
    id: termId,
    pty,
  });

  pty.onData((data) => {
    if (webContents.isDestroyed()) return;
    try {
      webContents.send(`term_data_${termId}`, data);
    } catch {
      // WebContents was destroyed between the check and the send — ignore.
    }
  });

  pty.onExit((event) => {
    const payload: TerminalExitPayload = {
      exitCode: event.exitCode,
      signal: event.signal,
    };
    terminals.delete(termId);
    if (webContents.isDestroyed()) return;
    try {
      webContents.send(`term_exit_${termId}`, payload);
    } catch {
      // WebContents was destroyed before exit could be reported — ignore.
    }
  });

  return {
    termId,
    cwd,
    shellPath,
    processName: pty.process,
  };
}

export function writeTerminal(termId: number, data: string) {
  terminals.get(termId)?.pty.write(data);
}

export function resizeTerminal(termId: number, cols: number, rows: number) {
  terminals.get(termId)?.pty.resize(clampDimension(cols, 80), clampDimension(rows, 24));
}

export function killTerminal(termId: number) {
  const terminal = terminals.get(termId);
  if (!terminal) {
    return;
  }

  terminal.pty.kill();
  terminals.delete(termId);
}

export function clearTerminal(termId: number) {
  terminals.get(termId)?.pty.clear();
}

export function killAllTerminals() {
  for (const terminal of terminals.values()) {
    terminal.pty.kill();
  }

  terminals.clear();
}
