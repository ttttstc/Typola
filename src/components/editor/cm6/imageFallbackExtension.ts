import { EditorView } from '@codemirror/view';

/**
 * 图片加载失败回退:监听 .cm-atomic-image 容器里 <img> 的 error 事件,
 * 给容器加 cm-atomic-image--failed 类,CSS 显示 "图片加载失败" 占位。
 *
 * 不动 atomic-editor 的 widget DOM(只读),只追加一个 class。
 */
export function imageFallbackExtension() {
  return EditorView.domEventHandlers({
    error(event) {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return false;
      const wrap = target.closest('.cm-atomic-image');
      if (wrap instanceof HTMLElement) {
        wrap.classList.add('cm-atomic-image--failed');
        if (target.alt) wrap.dataset.imageAlt = target.alt;
        if (target.src) wrap.dataset.imageSrc = target.src;
      }
      return false;
    },
  });
}