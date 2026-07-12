import { ViewPlugin, type EditorView } from '@codemirror/view';
import { resolveLocalImages } from '../../../services/localImageResolver';

type ImageAssetOptions = {
  filePath: () => string | undefined;
};

const IMAGE_SELECTOR = '.cm-atomic-image img';
const IMAGE_THROTTLE_MS = 100;

function containsAtomicImage(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.matches('.cm-atomic-image, img.cm-atomic-image, .cm-atomic-image img')) return true;
  return node.querySelector('.cm-atomic-image, img.cm-atomic-image, .cm-atomic-image img') !== null;
}

/** 将 atomic-editor 动态插入的图片交给统一的 Tauri 本地资源解析器。 */
export function imageAssetExtension(options: ImageAssetOptions) {
  return ViewPlugin.fromClass(class {
    private observer: MutationObserver;
    private timerId: number | null = null;
    private readonly observedImages = new Set<HTMLImageElement>();
    private readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.observer = new MutationObserver((records) => {
        let shouldSchedule = false;
        for (const record of records) {
          if (record.type === 'attributes') {
            if (record.attributeName === 'src') shouldSchedule = true;
            continue;
          }
          if (!record.addedNodes.length) continue;
          if (Array.from(record.addedNodes).some(containsAtomicImage)) {
            this.observeImages();
            shouldSchedule = true;
          }
        }
        if (shouldSchedule) this.schedule();
      });
      this.observer.observe(view.contentDOM, {
        childList: true,
        subtree: true,
      });
      this.observeImages();
      this.schedule();
    }

    private observeImages(): void {
      for (const image of this.observedImages) {
        if (!image.isConnected) this.observedImages.delete(image);
      }
      for (const image of this.view.contentDOM.querySelectorAll<HTMLImageElement>(IMAGE_SELECTOR)) {
        if (this.observedImages.has(image)) continue;
        this.observer.observe(image, { attributes: true, attributeFilter: ['src'] });
        this.observedImages.add(image);
      }
    }

    private schedule(): void {
      if (this.timerId !== null) return;
      this.timerId = window.setTimeout(() => {
        this.timerId = null;
        void resolveLocalImages(this.view.contentDOM, options.filePath());
      }, IMAGE_THROTTLE_MS);
    }

    destroy(): void {
      if (this.timerId !== null) window.clearTimeout(this.timerId);
      this.observer.disconnect();
      this.observedImages.clear();
    }
  });
}
