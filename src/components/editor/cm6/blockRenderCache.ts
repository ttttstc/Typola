export type BlockRenderType = 'katex' | 'mermaid';

export type BlockRenderResult =
  | { state: 'loading' }
  | { state: 'ready'; html: string }
  | { state: 'error'; message: string };

type CacheEntry = { result: BlockRenderResult; listeners: Set<() => void> };

const MAX_ENTRIES = 256;
const entries = new Map<string, CacheEntry>();

function sourceHash(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function key(type: BlockRenderType, source: string, themeId: string): string {
  return `${type}:${themeId}:${sourceHash(source)}`;
}

/** Source + theme keyed cache shared by all CM6 block widgets. */
export function getBlockRender(
  type: BlockRenderType,
  source: string,
  themeId: string,
  render: () => Promise<string>,
  onSettled: () => void,
): BlockRenderResult {
  const cacheKey = key(type, source, themeId);
  const existing = entries.get(cacheKey);
  if (existing) {
    if (existing.result.state === 'loading') existing.listeners.add(onSettled);
    return existing.result;
  }

  const loading: CacheEntry = { result: { state: 'loading' }, listeners: new Set([onSettled]) };
  entries.set(cacheKey, loading);
  void render().then((html) => {
    loading.result = { state: 'ready', html };
    loading.listeners.forEach((listener) => listener());
    loading.listeners.clear();
  }, (error: unknown) => {
    loading.result = {
      state: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
    loading.listeners.forEach((listener) => listener());
    loading.listeners.clear();
  });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return loading.result;
}
