import { ViewPlugin, type EditorView } from '@codemirror/view';
import { resolveLocalImages } from '../../../services/localImageResolver';

type ImageAssetOptions = {
  filePath: () => string | undefined;
};

/** 将 atomic-editor 动态插入的图片交给统一的 Tauri 本地资源解析器。 */
export function imageAssetExtension(options: ImageAssetOptions) {
  return ViewPlugin.fromClass(class {
    private observer: MutationObserver;
    private rafId: number | null = null;
    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.observer = new MutationObserver((records) => {
        if (records.some((record) => record.type === 'childList' || record.attributeName === 'src')) {
          this.schedule();
        }
      });
      this.observer.observe(view.contentDOM, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src'],
      });
      this.schedule();
    }

    private schedule(): void {
      if (this.rafId !== null) return;
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;
        void resolveLocalImages(this.view.contentDOM, options.filePath());
      });
    }

    destroy(): void {
      if (this.rafId !== null) window.cancelAnimationFrame(this.rafId);
      this.observer.disconnect();
    }
  });
}
