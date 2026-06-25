import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_PRESET_ID, getPreset, markdownToDocx, type PresetConfig, type PresetId } from './word';
import { createExportFileName, resolveDefaultExportPath } from './exportPathService';

export async function exportToWord(
  content: string,
  fileName: string,
  filePath: string | undefined,
  preset: PresetId | PresetConfig = DEFAULT_PRESET_ID,
): Promise<string> {
  const presetConfig = typeof preset === 'string' ? getPreset(preset) : preset;
  // 1. Get the blob from the conversion engine
  const blob = await markdownToDocx(content, presetConfig, { fileName });

  const path = await resolveDefaultExportPath({
    fileName: createExportFileName(fileName, 'docx'),
    filePath,
    extension: 'docx',
  });

  const buffer = await blob.arrayBuffer();
  return invoke<string>('write_export_file', {
    request: { path, data: Array.from(new Uint8Array(buffer)) },
  });
}
