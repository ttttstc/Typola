// 打字机模式(Typora typewriter scrolling):打字或移动光标时把光标行
// 滚动到编辑区视口约 40% 处,长文写作时视线不需要跟着光标下移。
//
// 防抖设计:
// - 目标位置与当前 scrollTop 偏差小于 MIN_SCROLL_DELTA_PX 时不滚动,
//   避免高频微调导致视口抖动;
// - 用户主动滚动(wheel/touchmove)后的短暂抑制窗口内不干预,把视口
//   控制权还给用户;窗口过后下一次输入/移动光标才重新接管;
// - 鼠标拖选进行中(选区非空的事务)不干预,不和拖选滚动抢位置。

import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';

/** 光标行在视口中的目标位置(距顶部比例)。 */
const CURSOR_ANCHOR_RATIO = 0.4;
/** 偏差小于该值(px)时不调整,避免抖动。 */
const MIN_SCROLL_DELTA_PX = 40;
/** 用户主动滚动(wheel/touchmove)后的抑制窗口。 */
const USER_SCROLL_SUPPRESS_MS = 400;

export function typewriterExtension(): Extension {
  let userScrollUntil = 0;
  const markUserScroll = () => {
    userScrollUntil = Date.now() + USER_SCROLL_SUPPRESS_MS;
  };
  return [
    EditorView.updateListener.of((update) => {
      if (!update.docChanged && !update.selectionSet) return;
      if (Date.now() < userScrollUntil) return;
      const selection = update.state.selection.main;
      if (!selection.empty && update.selectionSet) return;
      const view = update.view;
      const coords = view.coordsAtPos(selection.head);
      if (!coords) return;
      const scroller = view.scrollDOM;
      // coords 是视口坐标;换算成滚动内容内的绝对 y,再定位到视口 40% 处。
      const cursorAbsoluteY = coords.top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const target = Math.max(0, cursorAbsoluteY - scroller.clientHeight * CURSOR_ANCHOR_RATIO);
      if (Math.abs(target - scroller.scrollTop) < MIN_SCROLL_DELTA_PX) return;
      scroller.scrollTop = target;
    }),
    // 监听用户主动滚动:wheel/touchmove 打开短暂抑制窗口。
    ViewPlugin.fromClass(class {
      private readonly view: EditorView;

      constructor(view: EditorView) {
        this.view = view;
        view.scrollDOM.addEventListener('wheel', markUserScroll, { passive: true });
        view.scrollDOM.addEventListener('touchmove', markUserScroll, { passive: true });
      }

      destroy() {
        this.view.scrollDOM.removeEventListener('wheel', markUserScroll);
        this.view.scrollDOM.removeEventListener('touchmove', markUserScroll);
      }
    }),
  ];
}
