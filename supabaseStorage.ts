import { supabase, isSupabaseConfigured } from './supabaseClient';

const DEFAULT_BUCKET = ((import.meta as any).env.VITE_SUPABASE_BUCKET as string | undefined) || 'gestoresto';

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mimeMatch = /data:(.*?);base64/.exec(meta);
  const mime = mimeMatch?.[1] || 'application/octet-stream';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function sanitizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_/\.]/g, '');
}

/**
 * Faz upload de uma imagem (data URL) para Supabase Storage.
 * - Se Supabase não estiver configurado, devolve undefined (mantém fallback local/base64).
 * - Por defeito usa bucket VITE_SUPABASE_BUCKET ou "gestoresto".
 */
export async function uploadDataUrlToSupabase(
  dataUrl: string,
  path: string,
  bucket: string = DEFAULT_BUCKET
): Promise<string | undefined> {
  if (!isSupabaseConfigured() || !supabase) return undefined;

  const blob = dataUrlToBlob(dataUrl);
  const safePath = sanitizePath(path);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(safePath, blob, { upsert: true, contentType: blob.type });

  if (error) {
    console.warn('[Supabase] Falha ao subir ficheiro:', error.message);
    return undefined;
  }

  // Preferência: bucket público (publicUrl). Se o bucket for privado, isto pode não funcionar — use signed URLs.
  const { data } = supabase.storage.from(bucket).getPublicUrl(safePath);
  return data.publicUrl;
}
