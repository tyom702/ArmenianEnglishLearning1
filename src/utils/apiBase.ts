/**
 * Resolves backend API URLs.
 * Uses VITE_API_BASE_URL when frontend is deployed separately on a static host,
 * otherwise defaults to same-origin relative paths (/api/*).
 */
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const rawBase =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_API_BASE_URL === 'string'
      ? import.meta.env.VITE_API_BASE_URL.trim()
      : '';

  if (!rawBase) {
    return normalizedPath;
  }

  return `${rawBase.replace(/\/+$/, '')}${normalizedPath}`;
}
