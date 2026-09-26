#!/usr/bin/env node
// 跑统一 exe 验证套件（全量 smoke + deep），生成汇总 report。
// 调用方式：node .nimo/verification/scripts/run-all-non-ai.mjs
//   或 npm run verify:all
//
// 行为：
// - 单次运行 verify-exe-core.mjs（exe 只启动一次）
// - 解析 run.json 的 status / actions（含 tier）/ skipped
// - 按 smoke / deep 分组汇总到 .nimo/verification/evidence/_summary-non-ai.json + stdout

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

async function main() {
  console.log('='.repeat(60));
  console.log('Typola 非 AI 能力完整 exe 实跑（smoke + deep）');
  console.log('='.repeat(60));

  const suiteScript = path.join(verificationRoot, 'scripts', 'verify-exe-core.mjs');

  console.log('\n[1/1] 跑统一套件 verify-exe-core（全量）...');
  const run = await runScript(suiteScript);
  console.log(`    退出码: ${run.code}`);
  if (run.code !== 0) {
    console.log('    --- stderr 末尾 ---');
    console.log(run.stderr.slice(-2000));
  }

  const runDir = await findLatestRunDir('exe-core');
  let summaryRun = { status: 'no-run-dir', actions: [], skipped: [] };
  if (runDir) {
    try {
      const runJson = JSON.parse(await fs.readFile(path.join(evidenceRoot, runDir, 'run.json'), 'utf8'));
      const actions = (runJson.actions ?? []).map((a) => ({
        feature: a.feature,
        label: a.label,
        tier: a.tier,
        status: a.status,
      }));
      const skipped = runJson.skipped ?? [];
      const tierBreakdown = {};
      for (const tier of ['smoke', 'deep']) {
        const tierActions = actions.filter((a) => a.tier === tier);
        tierBreakdown[tier] = {
          passed: tierActions.filter((a) => a.status === 'passed').length,
          failed: tierActions.filter((a) => a.status === 'failed').length,
          total: tierActions.length,
        };
      }
      summaryRun = {
        runId: runJson.runId,
        status: runJson.status,
        tier: runJson.tier,
        actionPassed: actions.filter((a) => a.status === 'passed').length,
        actionFailed: actions.filter((a) => a.status === 'failed').length,
        actionTotal: actions.length,
        tierBreakdown,
        skippedCount: skipped.length,
        skipped,
        actions,
      };
    } catch (error) {
      summaryRun = { status: 'parse-error', error: String(error) };
    }
  }

  const summary = {
    observedAt: new Date().toISOString(),
    scripts: { suite: { exitCode: run.code } },
    core: summaryRun,
  };

  const summaryPath = path.join(evidenceRoot, '_summary-non-ai.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n' + '='.repeat(60));
  console.log('汇总（写入 ' + path.relative(repositoryRoot, summaryPath) + '）');
  console.log('='.repeat(60));
  console.log(`\n[suite]    status=${summaryRun.status ?? 'n/a'}  actions=${summaryRun.actionTotal ?? 0} (passed=${summaryRun.actionPassed ?? 0} / failed=${summaryRun.actionFailed ?? 0})  skipped=${summaryRun.skippedCount ?? 0}`);
  for (const [tier, breakdown] of Object.entries(summaryRun.tierBreakdown ?? {})) {
    console.log(`  [${tier}] passed=${breakdown.passed} / failed=${breakdown.failed} / total=${breakdown.total}`);
  }

  if (summaryRun.actions && summaryRun.actions.length > 0) {
    console.log('\n实跑动作清单：');
    for (const a of summaryRun.actions) {
      console.log(`  [${a.status === 'passed' ? '✓' : '✗'}] ${a.tier ?? '-'} ${a.feature} :: ${a.label}`);
    }
  }

  if (summaryRun.skipped && summaryRun.skipped.length > 0) {
    console.log('\n跳过清单（受外部依赖/原生对话框限制）：');
    for (const s of summaryRun.skipped) {
      console.log(`  - ${s.feature} :: ${s.item} :: ${s.reason}`);
    }
  }

  const failedActions = (summaryRun.actions ?? []).filter((a) => a.status === 'failed');
  if (failedActions.length > 0) {
    console.log('\n失败动作清单：');
    for (const a of failedActions) {
      console.log(`  - [${a.tier ?? '-'}] ${a.feature} :: ${a.label}`);
    }
  }

  process.exit(run.code === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('run-all-non-ai 失败：', error);
  process.exit(1);
});
