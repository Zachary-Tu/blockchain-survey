export const M1_PRESTART_TERMINAL_DISPOSITIONS = [
  "declined-before-start",
  "no-show-expired",
  "withdrawn-before-start",
  "technical-cancel-before-start",
] as const;

export type M1PreStartTerminalDisposition =
  (typeof M1_PRESTART_TERMINAL_DISPOSITIONS)[number];

export function isM1PreStartTerminalDisposition(
  value: unknown,
): value is M1PreStartTerminalDisposition {
  return typeof value === "string" &&
    (M1_PRESTART_TERMINAL_DISPOSITIONS as readonly string[]).includes(value);
}

export async function hashM1LaunchToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
