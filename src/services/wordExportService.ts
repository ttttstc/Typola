import { writeFile } from '@tauri-apps/plugin-fs';
import { DEFAULT_PRESET_ID, getPreset, markdownToDocx, type PresetConfig, type PresetId } from './word';
import { createExportFileName, resolveDefaultExportPath } from './exportPathService';

export async function exportToWord(
  content: string,
  fileName: string,
  filePath: string | undefined,
  preset: PresetId | PresetConfig = DEFAULT_PRESET_ID,
): Promise<string> {
  const presetConfig = typeof preset === 'string' ? getPreset(preset) : preset;
  const blob = await markdownToDocx(content, presetConfig, { fileName });

  const path = await resolveDefaultExportPath({
    fileName: createExportFileName(fileName, 'docx'),
    filePath,
    extension: 'docx',
  });

  // 走 plugin-fs binary IPC,Uint8Array 通过 Tauri channel 二进制传输。
  // 之前 invoke + Array.from(Uint8Array) 把 byte 转 number[],JSON 序列化时每 byte
  // 膨胀 3-4 倍,1MB docx 变 3-4MB JSON,大文档卡 UI。capabilities 的
  // fs:scope 已加 **/*.docx 允许任意目录写入。
  const buffer = await blob.arrayBuffer();
  await writeFile(path, new Uint8Array(buffer));
  return path;
}
