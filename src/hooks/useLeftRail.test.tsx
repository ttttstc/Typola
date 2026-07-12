import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLeftRail } from './useLeftRail';

type LeftRailApi = ReturnType<typeof useLeftRail>;

function Harness({ expose }: { expose: (api: LeftRailApi) => void }) {
  expose(useLeftRail({
    aiWorkbenchEnabled: true,
    defaultWidth: 320,
    minWidth: 240,
    maxWidth: 480,
    initialMode: 'aiWorkbench',
  }));
  return null;
}

describe('useLeftRail', () => {
  let host: HTMLDivElement;
  let root: Root;
  let api: LeftRailApi | undefined;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Harness expose={(next) => { api = next; }} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('closes the AI workbench with one primary navigation click', () => {
    act(() => api?.handleTogglePrimaryPanel());
    expect(api?.leftRailMode).toBe('none');
  });
});
