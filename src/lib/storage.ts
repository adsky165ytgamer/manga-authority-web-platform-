import { supabase } from "@/integrations/supabase/client";

const BUCKET = "manga";
const SIGNED_URL_TTL = 60 * 60 * 24; // Keep private media URLs short-lived.
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function validateUploadFile(file: File, kind: "image" | "pdf" | "audio") {
  const limits = { image: 10 * 1024 * 1024, pdf: 25 * 1024 * 1024, audio: MAX_FILE_SIZE };
  if (file.size <= 0 || file.size > limits[kind]) {
    throw new Error(`File is too large. Maximum for ${kind} files is ${Math.round(limits[kind] / 1024 / 1024)} MB.`);
  }
  const valid = kind === "image"
    ? file.type.startsWith("image/")
    : kind === "audio"
      ? file.type.startsWith("audio/")
      : file.type === "application/pdf";
  if (!valid) throw new Error(`Invalid ${kind} file type.`);
}

function validatePath(path: string) {
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("//")) {
    throw new Error("Invalid storage path.");
  }
}

export async function signPath(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  validatePath(path);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) return null;
  return data.signedUrl;
}

export async function signPaths(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  paths.forEach(validatePath);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error || !data) return paths.map(() => "");
  return data.map((d) => d.signedUrl ?? "");
}

export async function uploadFile(path: string, file: File): Promise<string> {
  validatePath(path);
  const kind = file.type === "application/pdf" ? "pdf" : file.type.startsWith("audio/") ? "audio" : "image";
  validateUploadFile(file, kind);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}
