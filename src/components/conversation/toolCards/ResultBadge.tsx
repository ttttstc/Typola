// 工具卡状态徽章 — 3 态 (running / ok / error)。
//
// 状态规则(照搬 OpenDesign ResultBadge):
// - !result && runStreaming  → running spinner
// - !result && !runSucceeded → error(已结束但没 result 视为失败)
// - result?.isError          → error + title 用 result.content
// - else                     → ok checkmark
//
// 图标用 lucide-react(OpenDesign 自带 Icon.tsx 不 fork,避免引入并行 icon 体系)。
// i18n 走 useSettings + translate,与项目其它组件保持一致。

import { Check, Loader2, X } from 'lucide-react';
import { useSettings } from '../../../hooks/useSettings';
import { translate } from '../../../services/i18n';
import type { ResultShape } from './shared';

type Props = {
  result?: ResultShape;
  runStreaming: boolean;
  runSucceeded: boolean;
};

export function ResultBadge({ result, runStreaming, runSucceeded }: Props) {
  const { locale } = useSettings();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  if (!result && runStreaming) {
    return (
      <span className="op-status op-status-running" title={t('toolRunning')} aria-label={t('toolRunning')}>
        <Loader2 size={14} className="op-status-spinner" />
      </span>
    );
  }

  if (!result && !runSucceeded) {
    return (
      <span className="op-status op-status-error" title={t('toolError')} aria-label={t('toolError')}>
        <X size={14} />
      </span>
    );
  }

  if (result?.isError) {
    return (
      <span
        className="op-status op-status-error"
        title={result.content || t('toolError')}
        aria-label={result.content || t('toolError')}
      >
        <X size={14} />
      </span>
    );
  }

  return (
    <span className="op-status op-status-ok" title={t('toolDone')} aria-label={t('toolDone')}>
      <Check size={14} />
    </span>
  );
}
