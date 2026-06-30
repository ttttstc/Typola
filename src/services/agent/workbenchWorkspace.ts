export type WorkbenchWorkspaceInputs = {
  configuredWorkspaceRoot?: string;
  defaultWorkspaceRoot?: string;
};

function nonEmpty(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveWorkbenchWorkspaceRoot({
  configuredWorkspaceRoot,
  defaultWorkspaceRoot,
}: WorkbenchWorkspaceInputs): string | undefined {
  return nonEmpty(configuredWorkspaceRoot)
    ?? nonEmpty(defaultWorkspaceRoot);
}
