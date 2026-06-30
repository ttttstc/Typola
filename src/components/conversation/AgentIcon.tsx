/**
 * Adapted from nexu-io/open-design
 * License: Apache-2.0
 * Original path: apps/web/src/components/AgentIcon.tsx
 * Modifications: reduced to Typola-supported AI CLI brands.
 */

import type { CSSProperties } from 'react';

type AgentIconProps = {
  id: string;
  size?: number;
  className?: string;
};

const ICON_EXT: Record<string, 'svg' | 'png'> = {
  claude: 'svg',
  opencode: 'svg',
  codex: 'svg',
};

const MONO_ICONS = new Set(['opencode']);

export function AgentIcon({ id, size = 18, className }: AgentIconProps) {
  const cls = `agent-icon${className ? ` ${className}` : ''}`;
  const ext = ICON_EXT[id];
  if (ext) {
    if (ext === 'svg' && MONO_ICONS.has(id)) {
      const src = `/agent-icons/${id}.svg`;
      const style: CSSProperties = {
        width: size,
        height: size,
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
      };
      return <span className={`${cls} agent-icon-mono`} style={style} aria-hidden="true" />;
    }
    return (
      <img
        src={`/agent-icons/${id}.${ext}`}
        alt=""
        width={size}
        height={size}
        className={cls}
        aria-hidden="true"
        draggable={false}
      />
    );
  }

  const initial = (id.match(/[a-z]/i)?.[0] ?? '?').toUpperCase();
  return (
    <span
      className={`${cls} agent-icon-fallback`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
