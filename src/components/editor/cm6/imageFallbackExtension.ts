import { ViewPlugin, type EditorView } from '@codemirror/view';

/**
 * 图片加载失败回退:监听 .cm-atomic-image 容器里 <img> 的 error 事件,
 * 给容器加 cm-atomic-image--failed 类,CSS 显示 "图片加载失败" 占位。
 *
 * 不动 atomic-editor 的 widget DOM(只读),只追加一个 class。
 */
export function imageFallbackExtension() {
  return ViewPlugin.fromClass(class {
    readonly onError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      const wrap = target.closest('.cm-atomic-image');
      if (wrap instanceof HTMLElement) {
        wrap.classList.add('cm-atomic-image--failed');
        wrap.setAttribute('aria-invalid', 'true');
        if (target.alt) wrap.dataset.imageAlt = target.alt;
        if (target.src) wrap.dataset.imageSrc = target.src;
      }
    };

    readonly view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      // img error 不冒泡,必须用 capture 才能在 CM6 根节点稳定接住。
      view.contentDOM.addEventListener('error', this.onError, true);
    }

    destroy() {
      this.view.contentDOM.removeEventListener('error', this.onError, true);
    }
  });
}
