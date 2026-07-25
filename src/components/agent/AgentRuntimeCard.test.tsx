// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRuntimeCard } from './AgentRuntimeCard';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('AgentRuntimeCard', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('keeps providers flat until their details are requested', () => {
    act(() => root.render(
      <AgentRuntimeCard
        runtime={{
          id: 'claude',
          label: 'Claude',
          description: '本地 Claude CLI',
          defaultCommand: 'claude',
          versionArgs: ['--version'],
        }}
        active
        pathValue=""
        detecting={false}
        onSetActive={() => undefined}
        onPathChange={() => undefined}
        onDetect={() => undefined}
      />,
    ));
    const summary = host.querySelector<HTMLButtonElement>('.agent-runtime-summary')!;
    expect(summary.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.agent-runtime-details')).toBeNull();
    act(() => summary.click());
    expect(summary.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.agent-runtime-details')).not.toBeNull();
  });
});
