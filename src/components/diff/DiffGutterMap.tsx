// 右侧滚动条改动地图:把所有可决策 hunk 渲染成一列小标记,当前焦点高亮,
// 点标记跳到对应 hunk。竖向位置按 hunk 在文档中的相对偏移(段索引/总段数)。

import { useMemo } from 'react';
import type { DiffHunk } from '../../services/diff/markdownDiff';
import { isDecidableHunk } from '../../services/diff/markdownDiff';
import type { HunkDecision } from '../../services/diff/markdownDiff';

type Props = {
  hunks: DiffHunk[];
  decisions: HunkDecision[];
  focusIndex: number;
  onFocus: (hunkIndex: number) => void;
};

export function DiffGutterMap({ hunks, decisions, focusIndex, onFocus }: Props) {
  const items = useMemo(() => {
    const total = hunks.length;
    if (total === 0) return [];
    let decisionIdx = -1;
    return hunks
      .map((hunk, hunkIndex) => {
        if (!isDecidableHunk(hunk)) return null;
        decisionIdx += 1;
        // 相对位置 = (hunkIndex + 0.5) / total,落在 1%~99% 之间
        const topPct = Math.min(99, Math.max(1, ((hunkIndex + 0.5) / total) * 100));
        return {
          hunkIndex,
          decisionIdx,
          kind: hunk.kind,
          topPct,
          decision: decisions[decisionIdx] ?? 'accept',
          active: hunkIndex === focusIndex,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [hunks, decisions, focusIndex]);

  if (items.length === 0) return null;

  return (
    <div className="diff-gutter-map" aria-label="改动地图">
      {items.map((it) => (
        <button
          key={it.hunkIndex}
          type="button"
          className={`diff-gutter-tick diff-gutter-tick--${it.kind} diff-gutter-tick--${it.decision} ${it.active ? 'diff-gutter-tick--active' : ''}`}
          style={{ top: `${it.topPct}%` }}
          onClick={() => onFocus(it.hunkIndex)}
          aria-label={`改动 ${it.decisionIdx + 1}`}
          data-tooltip={`第 ${it.decisionIdx + 1} 处`}
        />
      ))}
    </div>
  );
}
