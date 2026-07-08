import { Bot, FilePlus2, FileText, Play, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AutomationContextPacket, AutomationExecution, AutomationTemplate } from '../../services/automation';
import { describeAutomationContext } from '../../services/automation';

type AutomationCenterPanelProps = {
  templates: AutomationTemplate[];
  context: AutomationContextPacket;
  executions: AutomationExecution[];
  runningExecutionId?: string | null;
  onRunTemplate: (template: AutomationTemplate) => void;
  onRefreshContext: () => void;
  onOpenArtifact?: (path: string) => void;
  onClose: () => void;
};

const ACTION_ICONS = {
  insert_template: FilePlus2,
  create_artifact: FileText,
  run_ai_prompt: Bot,
};

function sensitivityLabel(value: AutomationContextPacket['sensitivity']): string {
  if (value === 'sends-to-ai') return '会发送到 AI';
  if (value === 'external-command') return '外部命令';
  return '本地';
}

function sourceLabel(source: AutomationTemplate['source']): string {
  if (source === 'project') return '项目';
  if (source === 'user-global') return '用户';
  return '内置';
}

function statusLabel(status: AutomationExecution['status']): string {
  const labels: Record<AutomationExecution['status'], string> = {
    running: '运行中',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
    'waiting-for-gate': '等待确认',
  };
  return labels[status];
}

function formatTime(value?: string): string {
  if (!value) return '';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '';
  return new Date(timestamp).toLocaleString();
}

function executionSummary(execution: AutomationExecution): string {
  if (execution.error) return execution.error;
  if (execution.status === 'running') return '正在执行动作。';
  if (execution.status === 'waiting-for-gate') return '等待确认后继续执行。';
  if (execution.status === 'cancelled') return '本次运行已取消。';

  const outputs = execution.actions.flatMap((action) => action.outputs ?? []);
  const artifact = outputs.find((output) => output.kind === 'artifact');
  if (artifact?.path) return `已生成产物:${artifact.path}`;
  const ai = outputs.find((output) => output.kind === 'ai');
  if (ai?.title) return `已发送到 AI 工作台:${ai.title}`;
  const editor = outputs.find((output) => output.kind === 'editor');
  if (editor?.title) return editor.title;
  return '本次运行已完成。';
}

export function AutomationCenterPanel({
  templates,
  context,
  executions,
  runningExecutionId = null,
  onRunTemplate,
  onRefreshContext,
  onOpenArtifact,
  onClose,
}: AutomationCenterPanelProps) {
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '');
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? templates[0],
    [selectedId, templates],
  );
  const contextRows = useMemo(() => describeAutomationContext(context), [context]);
  const latestExecution = executions[0];

  return (
    <aside className="automation-center-panel" aria-label="文档自动化中心">
      <header className="automation-center-header">
        <div>
          <strong>自动化</strong>
          <span>手动运行可审阅的文档模板</span>
        </div>
        <div className="automation-center-header-actions">
          <button type="button" onClick={onRefreshContext} title="刷新上下文">
            <RefreshCw size={14} />
          </button>
          <button type="button" onClick={onClose} title="关闭自动化中心">
            <X size={14} />
          </button>
        </div>
      </header>

      {latestExecution && (
        <section
          className={`automation-latest-execution status-${latestExecution.status}`}
          aria-label="最近一次自动化结果"
        >
          <div className="automation-section-title">
            <span>最近结果</span>
            <small>{statusLabel(latestExecution.status)}</small>
          </div>
          <strong>{latestExecution.templateTitle}</strong>
          <p>{executionSummary(latestExecution)}</p>
        </section>
      )}

      <section className="automation-context-panel" aria-label="运行上下文">
        <div className="automation-section-title">
          <span>Context Packet</span>
          <small>{sensitivityLabel(context.sensitivity)}</small>
        </div>
        <ul>
          {contextRows.map((row) => <li key={row}>{row}</li>)}
        </ul>
      </section>

      <section className="automation-template-panel" aria-label="自动化模板">
        <div className="automation-section-title">
          <span>模板</span>
          <small>{templates.length} 个 demo</small>
        </div>
        <ol className="automation-template-list">
          {templates.map((template) => {
            const active = selectedTemplate?.id === template.id;
            const running = runningExecutionId !== null && executions[0]?.templateId === template.id && executions[0]?.status === 'running';
            return (
              <li key={template.id} className={`automation-template-card ${active ? 'active' : ''}`}>
                <button
                  type="button"
                  className="automation-template-main"
                  onClick={() => setSelectedId(template.id)}
                  aria-pressed={active}
                >
                  <span className="automation-template-source">{sourceLabel(template.source)}</span>
                  <strong>{template.title}</strong>
                  <span>{template.description}</span>
                </button>
                <div className="automation-template-actions">
                  <div className="automation-action-icons" aria-label="动作">
                    {template.actions.map((action) => {
                      const Icon = ACTION_ICONS[action.type];
                      return (
                        <span key={action.id} title={action.label}>
                          <Icon size={13} />
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="automation-run-button"
                    disabled={runningExecutionId !== null}
                    onClick={() => onRunTemplate(template)}
                  >
                    <Play size={13} />
                    {running ? '运行中' : '运行'}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {selectedTemplate && (
        <section className="automation-detail-panel" aria-label="模板详情">
          <div className="automation-section-title">
            <span>Gate</span>
            <small>{selectedTemplate.trusted ? '受信模板' : '未受信'}</small>
          </div>
          <div className="automation-permission-row">
            <ShieldCheck size={15} />
            <span>
              {selectedTemplate.permissions.sendsToAi
                ? '手动运行即确认发送到当前 AI Provider。'
                : '只在本地编辑器或产物目录内执行。'}
            </span>
          </div>
          <ul className="automation-action-list">
            {selectedTemplate.actions.map((action) => (
              <li key={action.id}>
                <strong>{action.label}</strong>
                <span>{action.type}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="automation-execution-panel" aria-label="执行记录">
        <div className="automation-section-title">
          <span>Execution</span>
          <small>{executions.length ? '最近运行' : '暂无记录'}</small>
        </div>
        {executions.length === 0 ? (
          <div className="automation-empty">运行一个模板后，这里会显示动作状态和输出。</div>
        ) : (
          <ol className="automation-execution-list">
            {executions.slice(0, 6).map((execution) => (
              <li key={execution.id} className={`automation-execution-card status-${execution.status}`}>
                <div className="automation-execution-head">
                  <strong>{execution.templateTitle}</strong>
                  <span>{statusLabel(execution.status)}</span>
                </div>
                <div className="automation-execution-meta">
                  <span>{formatTime(execution.finishedAt ?? execution.startedAt)}</span>
                  {execution.contextSummary.documentName && <span>{execution.contextSummary.documentName}</span>}
                </div>
                {execution.error && <p className="automation-execution-error">{execution.error}</p>}
                <ul className="automation-execution-actions">
                  {execution.actions.map((action) => (
                    <li key={action.id}>
                      <span>{action.label}</span>
                      <em>{action.status}</em>
                      {action.outputs?.map((output) => {
                        const outputPath = output.path;
                        return outputPath && output.kind === 'artifact' && onOpenArtifact ? (
                          <button key={outputPath} type="button" onClick={() => onOpenArtifact(outputPath)}>
                            打开
                          </button>
                        ) : null;
                      })}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
