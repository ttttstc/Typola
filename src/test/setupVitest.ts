import { beforeEach } from 'vitest';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

const localStorageMock = createMemoryStorage();
const sessionStorageMock = createMemoryStorage();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  enumerable: true,
  value: localStorageMock,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  enumerable: true,
  value: sessionStorageMock,
});

beforeEach(() => {
  localStorageMock.clear();
  sessionStorageMock.clear();
});
