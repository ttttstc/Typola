import { Compartment, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const ZOOM_STEP = 0.05;
export const WHEEL_ZOOM_MIN = 9;
export const WHEEL_ZOOM_MAX = 32;

const setFontSize = StateEffect.define<number>();

/** 当前生效字号。wheel 滚轮和 configureBaseSize 都会更新这个字段。 */
const fontSizeField = StateField.define<number>({
  create: () => 14,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setFontSize)) return e.value;
    }
    return value;
  },
});

const fontSizeCompartment = new Compartment();

function clampSize(value: number): number {
  return Math.max(WHEEL_ZOOM_MIN, Math.min(WHEEL_ZOOM_MAX, value));
}

function makeTheme(size: number) {
  return EditorView.theme(
    {
      '.cm-content': { fontSize: `${size}px` },
    },
    { dark: false },
  );
}

type WheelZoomOptions = {
  /** 初始基线字号,通常传 settings.editorFontSize */
  baseSize: number;
  /** 字号变化回调(可选,用于把新值同步到 settings 持久化) */
  onChange?: (size: number) => void;
};

/** Cmd/Ctrl + 滚轮缩放扩展。
 *  wheel 事件 → 计算新字号 → 一次 dispatch 同时更新 StateField 和 reconfigure theme。 */
export function wheelZoomExtension({ baseSize, onChange }: WheelZoomOptions): Extension[] {
  const initialSize = clampSize(baseSize);
  return [
    fontSizeField,
    fontSizeCompartment.of(makeTheme(initialSize)),
    EditorView.domEventHandlers({
      wheel(event, view) {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const current = view.state.field(fontSizeField);
        const direction = event.deltaY < 0 ? 1 : -1;
        const next = clampSize(current * (1 + direction * ZOOM_STEP));
        if (next === current) return;
        view.dispatch({
          effects: [
            setFontSize.of(next),
            fontSizeCompartment.reconfigure(makeTheme(next)),
          ],
        });
        onChange?.(next);
      },
    }),
  ];
}

/** 当 settings.editorFontSize 变化时调用,把基线字号同步到当前 theme。 */
export function applyBaseSize(view: EditorView, baseSize: number): void {
  const next = clampSize(baseSize);
  view.dispatch({
    effects: [
      setFontSize.of(next),
      fontSizeCompartment.reconfigure(makeTheme(next)),
    ],
  });
}
