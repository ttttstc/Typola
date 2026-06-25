import { directoryFromPath } from '../terminalService';

export type WorkbenchWorkspaceInputs = {
  configuredWorkspaceRoot?: string;
  fileTreeRoot?: string;
  currentFilePath?: string;
};

function nonEmpty(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveWorkbenchWorkspaceRoot({
  configuredWorkspaceRoot,
  fileTreeRoot,
  currentFilePath,
}: WorkbenchWorkspaceInputs): string | undefined {
  return nonEmpty(configuredWorkspaceRoot)
    ?? nonEmpty(fileTreeRoot)
    ?? directoryFromPath(nonEmpty(currentFilePath));
}
