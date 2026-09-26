import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = "dist/assets";
const EXT_RE = /\.(js|css|ttf|woff2?)$/;

/**
 * 逻辑 key:剥尾部 hash 段用于「文件改名(hash 变化)但对账」场景。
 * 只剥最后一次 [-_] 分隔的尾段(5-20 位 base64),不迭代——多段名
 * (KaTeX_Main-Regular-hash)迭代剥会把语义段也吃掉导致不同文件撞 key。
 * 同一构建内撞 key 无害:聚合大小与 ledger 的同 key 聚合口径一致。
 */
export function logicalName(filename) {
  const ext = filename.slice(filename.lastIndexOf("."));
  const base = filename.slice(0, -ext.length);
  const m = base.match(/^(.+?)[-_]([0-9a-zA-Z][-_0-9a-zA-Z]{4,29})$/);
  if (!m || m[1].length < 2) return filename;
  const hash = m[2];
  // 真 hash 特征:含大写或数字;纯小写英文单词(如 style-mapping)不算
  const hashy = /[A-Z0-9]/.test(hash);
  return hashy ? `${m[1]}.*${ext}` : filename;
}

export function gzipKb(buf) {
  return gzipSync(buf).length / 1024;
}

export function readLedger(path = "perf-budget.json") {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeLedger(ledger, path = "perf-budget.json") {
  writeFileSync(path, JSON.stringify(ledger, null, 2) + "\n");
}

/** 按精确文件名收集 gzip 大小(capture/assert 的主口径)。 */
export function computeExactSizes(dir = ASSETS) {
  const files = readdirSync(dir).filter((f) => EXT_RE.test(f));
  const result = {};
  for (const name of files) {
    const buf = readFileSync(join(dir, name));
    result[name] = Math.round(gzipKb(buf) * 100) / 100;
  }
  return result;
}

/** 按逻辑 key 聚合(改名对账用)。 */
export function computeLogicalSizes(exactSizes) {
  const result = {};
  for (const [name, kb] of Object.entries(exactSizes)) {
    const key = logicalName(name);
    result[key] = Math.round(((result[key] || 0) + kb) * 100) / 100;
  }
  return result;
}

function ledgerEntries(ledger) {
  return Object.entries(ledger).filter(([, v]) => typeof v === "number");
}

/**
 * 两级比对:
 * 1) 精确文件名 —— 同名直接比大小(常态路径,hash 稳定时零歧义)
 * 2) 改名对账 —— 文件名消失时,若其逻辑 key 的聚合大小不变,视为 rename(OK)
 * 新出现的文件名若其逻辑 key 已在 ledger 中且聚合未涨,也按 rename 放行。
 */
export function compare(sizes, ledger) {
  const meta = ledger._meta ?? {};
  const ledgerFiles = meta.files ?? null; // { filename: kb }
  const deltas = [];
  let ledgerTotal = 0;
  let currentTotal = 0;

  for (const kb of Object.values(sizes)) currentTotal += kb;
  currentTotal = Math.round(currentTotal * 100) / 100;

  if (!ledgerFiles) {
    // 旧版 ledger(只有逻辑 key):退回逻辑聚合比对,保证迁移兼容
    const leds = Object.fromEntries(ledgerEntries(ledger));
    for (const kb of Object.values(leds)) ledgerTotal += kb;
    const logicalNow = computeLogicalSizes(sizes);
    for (const [key, current] of Object.entries(logicalNow)) {
      const baseline = leds[key];
      if (baseline === undefined) {
        deltas.push({ key, baseline: null, current, delta: null, status: "untracked" });
      } else {
        const diff = current - baseline;
        const status = diff > 0.005 ? "regressed" : diff < -0.005 ? "improved" : "ok";
        deltas.push({ key, baseline, current, delta: Math.round(diff * 100) / 100, status });
      }
    }
    for (const key of Object.keys(leds)) {
      if (logicalNow[key] === undefined) {
        deltas.push({ key, baseline: leds[key], current: null, delta: null, status: "removed" });
      }
    }
    return { deltas, ledgerTotal, currentTotal };
  }

  for (const kb of Object.values(ledgerFiles)) ledgerTotal += kb;
  ledgerTotal = Math.round(ledgerTotal * 100) / 100;

  const disappeared = [];
  for (const [name, baseline] of Object.entries(ledgerFiles)) {
    const current = sizes[name];
    if (current === undefined) {
      disappeared.push({ name, baseline });
      continue;
    }
    const diff = current - baseline;
    const status = diff > 0.005 ? "regressed" : diff < -0.005 ? "improved" : "ok";
    deltas.push({ key: name, baseline, current, delta: Math.round(diff * 100) / 100, status });
  }

  // 改名对账:消失文件的逻辑 key 若在当前集合里找到未对账的新文件,且总量不涨,放行
  const remaining = new Map(
    Object.entries(sizes).filter(([name]) => ledgerFiles[name] === undefined)
      .map(([name, kb]) => [name, kb]),
  );
  for (const { name, baseline } of disappeared) {
    const key = logicalName(name);
    // 在新文件里找同逻辑 key 的
    let matched = null;
    for (const [newName, kb] of remaining) {
      if (logicalName(newName) === key) { matched = { newName, kb }; break; }
    }
    if (matched && Math.abs(matched.kb - baseline) <= 0.02) {
      // rename 且大小不变:两清
      remaining.delete(matched.newName);
      deltas.push({ key: `${name} → ${matched.newName}`, baseline, current: matched.kb, delta: 0, status: "renamed" });
    } else if (matched && matched.kb < baseline) {
      remaining.delete(matched.newName);
      deltas.push({ key: `${name} → ${matched.newName}`, baseline, current: matched.kb, delta: Math.round((matched.kb - baseline) * 100) / 100, status: "improved" });
    } else {
      deltas.push({ key: name, baseline, current: null, delta: null, status: "removed" });
    }
  }

  // 剩余新文件:一律 untracked(必须先 capture 登记,防新增体积逃逸)
  for (const [name, current] of remaining) {
    deltas.push({ key: name, baseline: null, current, delta: null, status: "untracked" });
  }

  return { deltas, ledgerTotal, currentTotal };
}
