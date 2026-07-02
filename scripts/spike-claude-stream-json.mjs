#!/usr/bin/env node
// Spike: 验证 Claude Code stream-json input + tool_result 回写
// 用法: node scripts/spike-claude-stream-json.mjs

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const SESSION_ID = randomUUID();
const BIN = process.env.CLAUDE_BIN || 'claude';
const TIMEOUT_MS = 30000;

const args = [
  '-p',
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--permission-mode', 'bypassPermissions',
  '--session-id', SESSION_ID,
];

console.error(`[spike] bin=${BIN} session=${SESSION_ID}`);
console.error(`[spike] args: ${args.join(' ')}`);

const child = spawn(BIN, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: process.env,
  shell: process.platform === 'win32', // Windows: 解析 .cmd shim
});

let firstResponse = null;
let events = [];
let toolUseEvent = null;

child.stdout.on('data', (chunk) => {
  const lines = chunk.toString('utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    let evt;
    try { evt = JSON.parse(line); } catch { console.error('[stdout-raw]', line); continue; }
    events.push(evt);
    console.error(`[stdout] type=${evt.type || 'unknown'} ${evt.message?.stop_reason ? 'stop_reason=' + evt.message.stop_reason : ''}`);
    if (evt.type === 'assistant' && firstResponse == null) {
      firstResponse = JSON.stringify(evt, null, 2);
    }
    if (evt.type === 'content_block_start' && evt.content_block?.type === 'tool_use') {
      toolUseEvent = evt;
    }
  }
});

child.stderr.on('data', (chunk) => {
  console.error(`[stderr] ${chunk.toString('utf8').trimEnd()}`);
});

child.on('exit', (code, sig) => {
  console.error(`[spike] exit code=${code} signal=${sig}`);
  console.error(`[spike] total events: ${events.length}`);
  writeFileSync('docs/changes/_spike-output.json', JSON.stringify({ session: SESSION_ID, events, firstResponse }, null, 2));
  process.exit(code || 0);
});

// 首条 user prompt
const firstMsg = {
  type: 'user',
  message: {
    role: 'user',
    content: [{ type: 'text', text: 'Reply with exactly the word "ok" and nothing else.' }],
  },
};
child.stdin.write(JSON.stringify(firstMsg) + '\n');
console.error('[spike] wrote first user message');

// 等首条响应,然后试着写入第二条 message
const t0 = Date.now();
const wait = () => {
  if (firstResponse || Date.now() - t0 > TIMEOUT_MS) {
    console.error('[spike] timeout or first response received');
    // 写入第二条看看是否能继续
    if (firstResponse) {
      const secondMsg = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Now reply with exactly "second-turn-ok".' }],
        },
      };
      child.stdin.write(JSON.stringify(secondMsg) + '\n');
      console.error('[spike] wrote second user message');
    }
    setTimeout(() => {
      console.error('[spike] ending stdin');
      try { child.stdin.end(); } catch {}
      setTimeout(() => { try { child.kill('SIGTERM'); } catch {} }, 5000);
    }, 8000);
    return;
  }
  setTimeout(wait, 500);
};
setTimeout(wait, 500);
