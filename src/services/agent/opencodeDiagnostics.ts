import { redactSecrets } from './redact';

export type OpenCodeCliDiagnosticInput = {
  exitCode?: number | null;
  stderrTail?: string | null;
  error?: string | null;
  agentPath?: string | null;
  model?: string | null;
};

export type OpenCodeCliDiagnostic = {
  message: string;
  detail: string;
  retryable: boolean;
  code?: string;
};

function text(input: OpenCodeCliDiagnosticInput): string {
  return [input.error, input.stderrTail]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');
}

function tail(value: string): string {
  return redactSecrets(value).replace(/\s+/gu, ' ').trim().slice(-240);
}

function withTail(message: string, detail: string, raw: string, code: string): OpenCodeCliDiagnostic {
  const diagnosticTail = tail(raw);
  return {
    message,
    detail: diagnosticTail ? `${detail} OpenCode 输出：${diagnosticTail}` : detail,
    retryable: true,
    code,
  };
}

export function diagnoseOpenCodeCliFailure(input: OpenCodeCliDiagnosticInput): OpenCodeCliDiagnostic | null {
  if (input.exitCode === 0) return null;

  const raw = text(input);
  const normalized = raw.toLowerCase();
  const pathLabel = input.agentPath?.trim() || 'opencode';
  const model = input.model?.trim() || '';

  const missingExecutable =
    /enoent/i.test(raw) ||
    /os error 2/i.test(raw) ||
    /no such file or directory/i.test(raw) ||
    /cannot find the file/i.test(raw) ||
    /系统找不到指定的文件/u.test(raw) ||
    /not recognized as an internal or external command/i.test(raw);
  if (missingExecutable) {
    return withTail(
      'OpenCode CLI 未找到。',
      `Typola 尝试启动 ${pathLabel}，但系统找不到可执行文件。请先安装 OpenCode（npm install -g opencode-ai），或在设置里填写 opencode.cmd / opencode.exe 的完整路径。`,
      raw,
      'OPENCODE_NOT_FOUND',
    );
  }

  const permissionDenied =
    /permission denied/i.test(raw) ||
    /access is denied/i.test(raw) ||
    /拒绝访问/u.test(raw);
  if (permissionDenied) {
    return withTail(
      'OpenCode CLI 路径无法执行。',
      `Typola 找到了 ${pathLabel}，但当前系统不允许执行它。请检查文件权限，或改填 npm 全局目录下的 opencode.cmd / opencode.exe。`,
      raw,
      'OPENCODE_PATH_NOT_EXECUTABLE',
    );
  }

  const modelLooksInvalid = model.length > 0 && !/^[^/\s]+\/[^/\s]+$/u.test(model);
  const modelFailure =
    /model/i.test(raw) &&
    /(invalid|unknown|not found|not supported|unsupported|unavailable|no access|provider)/i.test(raw);
  if (modelLooksInvalid || modelFailure) {
    const modelHint = model
      ? `当前模型填写为 ${model}。`
      : '当前没有固定模型，OpenCode 会使用自身默认模型。';
    return withTail(
      'OpenCode 模型配置可能不正确。',
      `${modelHint} 如需固定模型，请使用 provider/model 格式，例如 anthropic/claude-sonnet-4；不确定时先清空模型字段，让 OpenCode 使用默认模型。`,
      raw,
      'OPENCODE_MODEL_INVALID',
    );
  }

  if (normalized.includes('auth') || normalized.includes('api key') || normalized.includes('unauthorized')) {
    return withTail(
      'OpenCode 认证未完成或已失效。',
      '请先在终端运行 opencode auth login，完成模型提供商登录后再回到 Typola 重试。',
      raw,
      'OPENCODE_AUTH_REQUIRED',
    );
  }

  if (!raw.trim() && input.exitCode === 1) {
    return {
      message: 'OpenCode 执行失败。',
      detail: 'OpenCode 退出但没有返回诊断。请先在终端运行 opencode，确认已完成安装、登录和模型选择；如果设置里固定了模型，可先清空模型字段后重试。',
      retryable: true,
      code: 'OPENCODE_FAILED_WITHOUT_OUTPUT',
    };
  }

  return raw.trim()
    ? withTail('OpenCode 执行失败。', 'OpenCode 返回了错误。', raw, 'OPENCODE_EXECUTION_FAILED')
    : null;
}
