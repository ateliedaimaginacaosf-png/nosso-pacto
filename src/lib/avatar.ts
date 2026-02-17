const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function getAvatarUrl(path: string | null) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}
