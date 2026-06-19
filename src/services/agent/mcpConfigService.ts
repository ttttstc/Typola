import { invoke } from '@tauri-apps/api/core';

export function readMcpConfig(cwd: string): Promise<string | null> {
  return invoke<string | null>('read_mcp_config', { request: { cwd } });
}

export function writeMcpConfig(cwd: string, content: string): Promise<void> {
  return invoke('write_mcp_config', { request: { cwd, content } });
}
