import { invoke } from '@tauri-apps/api/core';
import { writeFile } from '@tauri-apps/plugin-fs';
import { DEFAULT_PRESET_ID, getPreset, markdownToDocx, type PresetConfig, type PresetId } from './word';
import { createExportFileName, resolveDefaultExportPath } from './exportPathService';
import { detectPandocPath } from './pandocDetect';

export async function exportToWord(
  content: string,
  fileName: string,
  filePath: string | undefined,
  preset: PresetId | PresetConfig = DEFAULT_PRESET_ID,
): Promise<string> {
  const path = await resolveDefaultExportPath({
    fileName: createExportFileName(fileName, 'docx'),
    filePath,
    extension: 'docx',
  });

  const pandoc = await detectPandocPath();
  if (pandoc) {
    await invoke('export_pandoc_file', {
      path,
      markdown: content,
      format: 'docx',
      documentPath: filePath ?? null,
      pandocPath: pandoc,
      pandocArgs: '',
    });
    return path;
  }

  // 回退到前端 WASM 渲染
  const presetConfig = typeof preset === 'string' ? getPreset(preset) : preset;
  const blob = await markdownToDocx(content, presetConfig, { fileName });
  const buffer = await blob.arrayBuffer();
  await writeFile(path, new Uint8Array(buffer));
  return path;
}
