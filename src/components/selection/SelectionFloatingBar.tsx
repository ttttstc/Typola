// 选区浮条 —— 选中文字时贴在选区上方自动浮现的横排工具条。
//
// 跟现有 SelectionAIMenu(右键菜单)并存:
//   - 浮条:选中即现,鼠标流主入口,横向 icon + 文字
//   - 右键菜单:Ctrl+K / 右键唤起,纵向列表,保留给习惯右键的用户
//   - 两者共用 SELECTION_ACTIONS,点击都走 onPick → useEditorSelectionBridge 的 C 混合分流
//
// 行为:
//   - 选区从空 → 非空:200ms debounce 后浮现(避免拖选过程中闪烁)
//   - 选区从非空 → 空:立即隐藏
//   - Esc:隐藏(只对当前选区)
//
// 定位:渲染时用 rect 估算初始位置 → useLayoutEffect 在已渲染的 div 上读真实尺寸
// 精确回弹(直接改 DOM style)。**不要**把渲染 gate 在一个"需要先渲染才能算出来"
// 的 position state 上,否则鸡生蛋死锁(浮条永不显示)。

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SELECTION_ACTIONS, type SelectionActionId } from '../../services/agent/selectionActions';

const ACTION_IDS: SelectionActionId[] = ['polish', 'shorten', 'expand', 'explain', 'proofread', 'custom', 'review'];
const SHOW_DEBOUNCE_MS = 200;
const ESTIMATED_WIDTH = 360;
const ESTIMATED_HEIGHT = 36;
const GAP = 8;
const PADDING = 6;

type FloatingBarRect = {
  /** 选区在视口里的矩形(用于把浮条贴到选区上方) */
  selRect: DOMRect;
};

type Props = {
  /** 当前选区矩形,null = 无选区,浮条应隐藏 */
  rect: FloatingBarRect | null;
  /** 当前选区是否仍有有效非空文本 */
  hasSelection: boolean;
  /** 选择动作时回调,带触发点视口坐标(用于浮卡定位) */
  onPick: (action: SelectionActionId, origin: { x: number; y: number }) => void;
};

export function SelectionFloatingBar({ rect, hasSelection, onPick }: Props) {
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const dismissedForCurrentSelectionRef = useRef(false);

  // debounce 显示;选区消失立即隐藏
  useEffect(() => {
    if (!rect || !hasSelection) {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      setVisible(false);
      dismissedForCurrentSelectionRef.current = false;
      return;
    }
    if (dismissedForCurrentSelectionRef.current) return;
    if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current);
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      setVisible(true);
    }, SHOW_DEBOUNCE_MS);
    return () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, [rect, hasSelection]);

  // 渲染后用真实尺寸精确定位 + 视口回弹(paint 前跑,不闪)。
  useLayoutEffect(() => {
    if (!visible || !rect) return;
    const bar = barRef.current;
    if (!bar) return;
    const vw = window.innerWidth;
    const r = bar.getBoundingClientRect();
    const barWidth = r.width || ESTIMATED_WIDTH;
    const barHeight = r.height || ESTIMATED_HEIGHT;
    let top = rect.selRect.top - barHeight - GAP;
    if (top < PADDING) top = rect.selRect.bottom + GAP; // 上方空间不够 → 放下方
    let left = rect.selRect.left + rect.selRect.width / 2 - barWidth / 2;
    if (left < PADDING) left = PADDING;
    if (left + barWidth > vw - PADDING) left = vw - barWidth - PADDING;
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
  }, [visible, rect]);

  // Esc 隐藏(只对当前选区);下次选区变化才再次显示
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissedForCurrentSelectionRef.current = true;
        setVisible(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [visible]);

  if (!visible || !rect) return null;

  // 初始估算位置(useLayoutEffect 会同帧用真实尺寸覆盖,不闪)。
  let initTop = rect.selRect.top - ESTIMATED_HEIGHT - GAP;
  if (initTop < PADDING) initTop = rect.selRect.bottom + GAP;
  const initLeft = Math.max(
    PADDING,
    Math.min(
      rect.selRect.left + rect.selRect.width / 2 - ESTIMATED_WIDTH / 2,
      window.innerWidth - ESTIMATED_WIDTH - PADDING,
    ),
  );

  const handlePick = (id: SelectionActionId) => {
    // origin 用选区位置算(浮条点击后会消失,用 rect 比读 bar 位置稳),
    // 给结果卡/检视浮卡一个贴近选区下方的锚点。
    onPick(id, { x: rect.selRect.left, y: rect.selRect.bottom + 6 });
  };

  return (
    <div
      ref={barRef}
      className="selection-floating-bar"
      role="toolbar"
      aria-label="选区 AI 动作"
      style={{ left: initLeft, top: initTop }}
      // 阻止 mousedown 默认行为,免得点浮条按钮时把编辑器选区清掉
      onMouseDown={(event) => event.preventDefault()}
    >
      {ACTION_IDS.map((id) => {
        const action = SELECTION_ACTIONS[id];
        const Icon = action.icon;
        return (
          <button
            key={id}
            type="button"
            className="selection-floating-bar-item"
            onClick={() => handlePick(id)}
            title={action.label}
            aria-label={action.label}
          >
            <span className="selection-floating-bar-icon" aria-hidden="true">
              <Icon size={15} strokeWidth={1.7} />
            </span>
            <span className="selection-floating-bar-label">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
