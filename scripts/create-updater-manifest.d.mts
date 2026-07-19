export function selectNsisSignature(paths: string[]): string;
export function createWindowsManifest(options: {
  version: string;
  notes: string;
  signature: string;
  assetName: string;
  publishedAt: string;
}): {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<'windows-x86_64', { signature: string; url: string }>;
};
