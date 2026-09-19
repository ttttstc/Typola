#!/usr/bin/env node

// 串行跑 verify:exe-core + verify:exe-core:extended，生成汇总 report。
// 调用方式：node .nimo/verification/scripts/run-all-non-ai.mjs
//   或 npm run verify:exe-core:all
//
// 行为：
// - 先跑 core 套件，成功后跑 extended 套件（任一失败不阻断另一个）
// - 解析每个 run.json 的 status / actions / skipped
// - 汇总到 .nimo/verification/evidence/_summary-non-ai.json + stdout

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..', '..');
const verificationRoot = path.join(repositoryRoot, '.nimo', 'verification');
const evidenceRoot = path.join(verificationRoot, 'evidence');

async function runScript(scriptPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function findLatestRunDir(suffix) {
  const entries = await fs.readdir(evidenceRoot, { withFileTypes: true });
  const matching = entries
    .filter((e) => e.isDirectory() && e.name.endsWith(`-${suffix}`))
    .map((e) => e.name)
    .sort()
    .reverse();
  return matching[0] ?? null;
}

async function summarizeRun(suffix) {
  const runDir = await findLatestRunDir(suffix);
  if (!runDir) return { suffix, status: 'no-run-dir', actions: [], skipped: [] };
  const runJsonPath = path.join(evidenceRoot, runDir, 'run.json');
  try {
    const run = JSON.parse(await fs.readFile(runJsonPath, 'utf8'));
    const actions = (run.actions ?? []).map((a) => ({
      feature: a.feature,
      label: a.label,
      status: a.status,
    }));
    const skipped = run.skipped ?? [];
    return {
      suffix,
      runId: run.runId,
      status: run.status,
      actionPassed: actions.filter((a) => a.status === 'passed').length,
      actionFailed: actions.filter((a) => a.status === 'failed').length,
      actionTotal: actions.length,
      skippedCount: skipped.length,
      skipped,
      actions,
    };
  } catch (error) {
    return { suffix, status: 'parse-error', error: String(error) };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Typola 非 AI 能力完整 exe 实跑');
  console.log('='.repeat(60));

  const coreScript = path.join(verificationRoot, 'scripts', 'verify-exe-core-suite.mjs');
  const extendedScript = path.join(verificationRoot, 'scripts', 'verify-exe-core-extended.mjs');

  console.log('\n[1/2] 跑 verify:exe-core（core 套件）...');
  const coreRun = await runScript(coreScript);
  console.log(`    退出码: ${coreRun.code}`);
  if (coreRun.code !== 0) {
    console.log('    --- stderr 末尾 ---');
    console.log(coreRun.stderr.slice(-2000));
  }

  console.log('\n[2/2] 跑 verify:exe-core:extended（extended 套件）...');
  const extRun = await runScript(extendedScript);
  console.log(`    退出码: ${extRun.code}`);
  if (extRun.code !== 0) {
    console.log('    --- stderr 末尾 ---');
    console.log(extRun.stderr.slice(-2000));
  }

  const summary = {
    observedAt: new Date().toISOString(),
    scripts: {
      core: { exitCode: coreRun.code },
      extended: { exitCode: extRun.code },
    },
    core: await summarizeRun('exe-core-suite'),
    extended: await summarizeRun('exe-core-extended'),
  };

  const summaryPath = path.join(evidenceRoot, '_summary-non-ai.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n' + '='.repeat(60));
  console.log('汇总（写入 ' + path.relative(repositoryRoot, summaryPath) + '）');
  console.log('='.repeat(60));
  console.log(`\n[core]    status=${summary.core.status ?? 'n/a'}  actions=${summary.core.actionTotal ?? 0} (passed=${summary.core.actionPassed ?? 0} / failed=${summary.core.actionFailed ?? 0})  skipped=${summary.core.skippedCount ?? 0}`);
  console.log(`[extended] status=${summary.extended.status ?? 'n/a'}  actions=${summary.extended.actionTotal ?? 0} (passed=${summary.extended.actionPassed ?? 0} / failed=${summary.extended.actionFailed ?? 0})  skipped=${summary.extended.skippedCount ?? 0}`);

  if (summary.extended.actions && summary.extended.actions.length > 0) {
    console.log('\nextended 实跑动作清单：');
    for (const a of summary.extended.actions) {
      console.log(`  [${a.status === 'passed' ? '✓' : '✗'}] ${a.feature} :: ${a.label}`);
    }
  }

  if (summary.extended.skipped && summary.extended.skipped.length > 0) {
    console.log('\nextended 跳过清单（受外部依赖/原生对话框限制）：');
    for (const s of summary.extended.skipped) {
      console.log(`  - ${s.feature} :: ${s.item} :: ${s.reason}`);
    }
  }

  const failedActions = [
    ...(summary.core.actions ?? []).filter((a) => a.status === 'failed'),
    ...(summary.extended.actions ?? []).filter((a) => a.status === 'failed'),
  ];
  if (failedActions.length > 0) {
    console.log('\n失败动作清单：');
    for (const a of failedActions) {
      console.log(`  - ${a.feature} :: ${a.label}`);
    }
  }

  process.exit(coreRun.code === 0 && extRun.code === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('run-all-non-ai 失败：', error);
  process.exit(1);
});
