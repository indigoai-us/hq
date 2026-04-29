export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]*(?:\/[A-Z][A-Z0-9_]+)*$/;
export const GROUP_ID_PATTERN = /^grp_[A-Za-z0-9_-]+$/;
export const EMAIL_PATTERN = /^[^\s]+@[^\s]+$/;

export function normalizeFilePrefix(prefix: string): string {
  if (prefix.endsWith("/")) {
    return prefix + "*";
  }
  return prefix;
}
