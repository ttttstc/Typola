/**
 * Allows the current artifact output directory for plugin-fs operations.
 * The Rust command only accepts directories named `.typola-output`.
 */
export async function ensureArtifactOutputScope(outputRoot: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('allow_artifact_output_directory', { dir: outputRoot });
}
