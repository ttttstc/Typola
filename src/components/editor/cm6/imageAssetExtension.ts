// CM6 图片资源解析:把 atomic-editor imageBlocks() widget 里 <img> 的
// 相对路径 src 转为 Tauri asset:// URL,让本地图片能在 WebView 中加载。
//
// 设计要点:
// - atomic-editor 的 ImageWidget 把 src 写死在 DOM 上(img.src = this.src),
//   无法控制它的 eq/toDOM 生命周期。唯一介入点是 MutationObserver:
//   监听 contentDOM 子树变化,对新增节点中的 img[src] 做后处理。
// - 只做"相对路径 → 绝对路径 → asset URL"这一件事,不触碰 https/data/asset
//   等已经可用的 URL,保证幂等。
// - 用 requestAnimationFrame 合并同一帧内多次 addedNodes 触发,避免
//   大批量粘贴时反复 layout thrash。
// - filePath 通过 getter 传入,响应文件切换(打开另一个 .md)时拿到最新目录。

import { ViewPlugin, type EditorView } from '@codemirror/view';
import { resolveLocalResourcePath } from '../../../services/htmlPresentationService';

type ConvertFn = (filePath: string, protocol?: string) => string;

let convertFileSrcFn: ConvertFn | null = null;
let convertFileSrcAvailable = true;

async function ensureConvertFileSrc(): Promise<ConvertFn | null> {
  if (convertFileSrcFn !== null) return convertFileSrcFn;
  if (!convertFileSrcAvailable) return null;
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    convertFileSrcAvailable = false;
    return null;
  }
  try {
    const { convertFileSrc } = await import('@tauri-apps/api/core');
    convertFileSrcFn = convertFileSrc;
    return convertFileSrcFn;
  } catch {
    convertFileSrcAvailable = false;
    return null;
  }
}

function isAlreadyResolvedSrc(src: string): boolean {
  return (
    src.startsWith('asset:') ||
    src.startsWith('https://') ||
    src.startsWith('http://') ||
    src.startsWith('data:') ||
    src.startsWith('file://') ||
    src.startsWith('//') ||
    src.startsWith('#')
  );
}

function collectImages(root: Node, out: HTMLImageElement[]): void {
  if (root instanceof HTMLImageElement) {
    out.push(root);
    return;
  }
  if (root instanceof Element) {
    const imgs = root.querySelectorAll<HTMLImageElement>('img[src]');
    for (const img of imgs) out.push(img);
  }
}

type ImageAssetOptions = {
  /** 动态读取当前文档绝对路径,响应文件切换。 */
  filePath: () => string | undefined;
};

export function imageAssetExtension(options: ImageAssetOptions) {
  return ViewPlugin.fromClass(
    class {
      private view: EditorView;
      private observer: MutationObserver | null = null;
      private pending: HTMLImageElement[] = [];
      private rafId: number | null = null;
      private convertFn: ConvertFn | null = null;

      constructor(view: EditorView) {
        this.view = view;
        void ensureConvertFileSrc().then((fn) => {
          this.convertFn = fn;
          if (!fn) return;
          const initial: HTMLImageElement[] = [];
          collectImages(this.view.contentDOM, initial);
          if (initial.length > 0) this.schedule(initial);
          this.observer = new MutationObserver((records) => {
            const found: HTMLImageElement[] = [];
            for (const record of records) {
              if (record.type !== 'childList') continue;
              for (const node of record.addedNodes) {
                if (node instanceof Element && this.view.contentDOM.contains(node)) {
                  collectImages(node, found);
                }
              }
            }
            if (found.length > 0) this.schedule(found);
          });
          this.observer.observe(this.view.contentDOM, { childList: true, subtree: true });
        });
      }

      private schedule(imgs: HTMLImageElement[]): void {
        this.pending.push(...imgs);
        if (this.rafId !== null) return;
        this.rafId = window.requestAnimationFrame(() => {
          this.rafId = null;
          const batch = this.pending;
          this.pending = [];
          const fn = this.convertFn;
          const filePath = options.filePath();
          if (!fn || !filePath) return;
          for (const img of batch) {
            const raw = img.getAttribute('src');
            if (!raw || isAlreadyResolvedSrc(raw)) continue;
            const abs = resolveLocalResourcePath(filePath, raw);
            if (!abs) continue;
            img.src = fn(abs);
          }
        });
      }

      destroy(): void {
        if (this.rafId !== null) window.cancelAnimationFrame(this.rafId);
        this.observer?.disconnect();
        this.observer = null;
        this.pending = [];
      }
    },
  );
}
