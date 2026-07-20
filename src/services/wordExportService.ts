import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { DEFAULT_PRESET_ID, getPreset, markdownToDocx, type PresetConfig, type PresetId } from './word';
import { createExportFileName, resolveDefaultExportPath } from './exportPathService';

export type ExportProgressCallback = (progress: number, detail: string) => void;

export async function exportToWord(
  content: string,
  fileName: string,
  filePath: string | undefined,
  preset: PresetId | PresetConfig = DEFAULT_PRESET_ID,
  onProgress?: ExportProgressCallback,
): Promise<string | null> {
  onProgress?.(5, '选择保存位置');
  const defaultPath = await resolveDefaultExportPath({
    fileName: createExportFileName(fileName, 'docx'),
    filePath,
    extension: 'docx',
  });

  const targetPath = await save({
    defaultPath,
    filters: [{ name: 'Word', extensions: ['docx'] }],
  });

  if (!targetPath) return null;

  onProgress?.(15, '准备 Word 排版');
  const presetConfig = typeof preset === 'string' ? getPreset(preset) : preset;
  const blob = await markdownToDocx(content, presetConfig, {
    fileName,
    filePath,
    onProgress,
  });
  onProgress?.(92, '写入 Word 文件');
  const buffer = await blob.arrayBuffer();
  await writeFile(targetPath, new Uint8Array(buffer));
  onProgress?.(100, 'Word 文件已写入');
  return targetPath;
}
