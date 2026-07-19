export function assertStableVersion(value: string): string;
export function synchronizeVersionText(path: string, source: string, version: string): string;
export function assertReleaseTag(tag: string, version: string): void;
export function assertReleaseVersionChanged(previousVersion: string, version: string): void;
