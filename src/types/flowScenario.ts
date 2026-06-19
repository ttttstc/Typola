export type FlowScenario = {
  id: string;
  label: string;
  icon?: string;
  description: string;
  guidance?: string;
  promptTemplate: string;
  skillHint?: string;
};

export type FlowScenarioContext = {
  file?: string;
  fileName?: string;
  workspace?: string;
  date?: string;
};

export const FLOW_SCENARIO_DEFAULT_SEED: FlowScenario[] = [
  {
    id: 'html-ppt',
    label: 'HTML 生成',
    icon: 'presentation',
    description: '把当前文档转成可演示的 HTML 页面,产物落在同目录',
    guidance:
      '在终端里点完「应用到终端」后,你可以补充可选参数,例如：\n\n' +
      '- 主题色 / 配色风格\n' +
      '- 章节拆分粒度(按 H1 / H2)\n' +
      '- 是否包含目录页\n\n' +
      '示例: `把 chapter.md 生成 HTML 演示,使用深色主题,按 H1 拆分`\n\n' +
      '按 Enter 提交后,Claude 会用你安装的 `/baoyu-slide-deck` skill 链生成,产物落盘到当前目录,会自动出现在右侧预览的「本次产物」里。',
    promptTemplate: '把 {file} 生成 HTML 演示,输出到 {fileName}.html',
    skillHint: '/baoyu-slide-deck',
  },
];
