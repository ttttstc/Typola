## Summary

<!-- 1-3 行说这个 PR 做了什么。 -->

-

## Why

<!-- 为什么要做。关联的 ISS 编号、用户反馈、回归现象。不写 why 的 PR 不接。 -->

- 关联 ISS: <!-- 例: ISS-139 / 无 -->
- 触发场景:

## Test Plan

<!-- 实际跑过的命令和结果。不接受 "Not run in this step"。 -->

```text
$ npm run typecheck
$ npm test
$ npm run lint
$ npm run build
$ cd src-tauri && cargo check
$ npm run test:e2e -- e2e/layout-behavior.spec.ts
```

实际结果（贴汇总行）:

- `npm test`:
- `npm run build`:
- `npm run test:e2e`:
- 涉及 UI 时附 `npm run tauri dev` 本地手测结论:

## Performance Before/After

<!-- Sprint 0 perf baseline (ISS-133). 路径过滤器触发了 perf-budget
     workflow 时本节必填；未触发时填 N/A 并说明。基线数据由
     `perf-budget.json` 锁定，命令:
       $ npm run perf:bundle:report    # 抓当前 build 的 chunk 表
       $ npm run perf:bundle            # 跟 ledger 对比，CI 同款 -->
     端到端 P50（cm6-input → 下一帧 paint）只在修改 `src/components/editor/cm6/**`
     或 `src/perf/**` 时需要填。 -->

### Bundle size (gzip kB)

| chunk | before | after | delta |
| --- | ---: | ---: | ---: |
| (top 5 changed) | | | |

### CM6 input → paint p50 (ms)

| fixture | before | after | delta |
| --- | ---: | ---: | ---: |
| `cm6-markdown-5k.md` | | | |
| `cm6-markdown-10k-100-headings.md` | | | |

- [ ] 已对照 `perf-budget.json`（无未跟踪 chunk）
- [ ] 未触发表格内行时填了 N/A 并说明原因

## Risk & Rollback

<!-- 可能的副作用、回滚方法、是否触及 CONTRIBUTING.md §5.3 的近期决策。 -->

- 触及的禁用项 / 决策:
- 回滚方法:

## Checklist

<!-- 按需勾选；reviewer 会逐项检查。 -->

- [ ] 已读 `CONTRIBUTING.md` §3 / §5
- [ ] `docs/TASKS.md` 中对应任务已勾选或已更新
- [ ] `docs/DECISIONS.md` 已记录本次工作摘要
- [ ] 涉及用户可见变更时 `CHANGELOG.md` 已更新
- [ ] 涉及 UI 时已对照 `docs/DESIGN.md`
- [ ] 未引入新依赖，或已说明原因
