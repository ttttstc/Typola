import { readdirSync, statSync } from "node:fs";
import { computeExactSizes, writeLedger } from "./_lib.mjs";

// 跨构建残留检测:index.html 是每次构建重写的;若任一 asset 比 index.html 旧,
// 说明 dist 叠加了旧构建(此时 ledger 会记到双份体积)。分 chunk 本身同名前缀
// 不同 hash 是 rolldown 正常行为,不能作为残留判据。
const htmlStat = statSync("dist/index.html");
const stale = readdirSync("dist/assets").filter((f) => {
  const s = statSync(`dist/assets/${f}`);
  return s.mtimeMs < htmlStat.mtimeMs - 1000;
});
if (stale.length > 0) {
  console.error(`dist/assets 有 ${stale.length} 个早于 index.html 的旧构建残留(如 ${stale[0]})。\n请先删除 dist 再 npm run build。`);
  process.exit(1);
}

const sizes = computeExactSizes();
const now = new Date().toISOString().slice(0, 16).replace("T", " ");

// capture 即全量重登:ledger 记录 { filename: gzipKb } 精确映射
writeLedger({
  _meta: { capturedAt: now, source: "npm run build", files: sizes },
});

console.log(`perf-budget.json captured (${Object.keys(sizes).length} files)`);
