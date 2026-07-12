// Convert a username to the synthetic email used inside Supabase Auth.
// Members log in with just a username; we store an internal email.
const EMAIL_DOMAIN = "manga-authority.internal";

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string | undefined | null): string {
  if (!email) return "";
  return email.split("@")[0];
}
