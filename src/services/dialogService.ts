// 可靠的确认/提示对话框。
// Tauri(WebView2)下 window.confirm/alert 不可靠（可能不弹窗直接返回 true），
// 改用 @tauri-apps/plugin-dialog（与文件选择器同源，确认可用）；浏览器/测试环境回退原生。

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type ConfirmOptions = {
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
};

export async function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  if (isTauriRuntime()) {
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    return confirm(message, {
      title: options.title ?? 'Typola',
      kind: 'warning',
      okLabel: options.okLabel,
      cancelLabel: options.cancelLabel,
    });
  }
  return window.confirm(message);
}

export async function messageDialog(message: string, options: { title?: string } = {}): Promise<void> {
  if (isTauriRuntime()) {
    const { message: showMessage } = await import('@tauri-apps/plugin-dialog');
    await showMessage(message, { title: options.title ?? 'Typola', kind: 'warning' });
    return;
  }
  window.alert(message);
}

export async function saveFileDialog(defaultPath?: string): Promise<string | null> {
  if (isTauriRuntime()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const result = await save({ defaultPath });
    return result ?? null;
  }
  return null;
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

// 关闭含未保存修改的文档时的三选一：保存并关闭 / 放弃并关闭 / 取消。
export async function confirmUnsavedChoice(name: string): Promise<UnsavedChoice> {
  const save = await confirmDialog(`“${name}” 有未保存的修改，是否保存？`, {
    title: '未保存的修改',
    okLabel: '保存并关闭',
    cancelLabel: '不保存',
  });
  if (save) return 'save';

  const discard = await confirmDialog('不保存并关闭？未保存的修改将丢失。', {
    title: '放弃修改',
    okLabel: '放弃并关闭',
    cancelLabel: '取消',
  });
  return discard ? 'discard' : 'cancel';
}
