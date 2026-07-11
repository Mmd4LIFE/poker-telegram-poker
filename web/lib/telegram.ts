// Thin wrapper around the Telegram WebApp SDK (loaded via <script> in layout).
/* eslint-disable @typescript-eslint/no-explicit-any */

export type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";

export function tg(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).Telegram?.WebApp ?? null;
}

export function initTelegram() {
  const w = tg();
  if (!w) return;
  try {
    w.ready();
    w.expand();
    w.setHeaderColor?.("#1a2030");
    w.setBackgroundColor?.("#151a24");
    w.disableVerticalSwipes?.();
  } catch {
    /* ignore */
  }
}

export function startParam(): string | null {
  const p = tg()?.initDataUnsafe?.start_param;
  if (p) return p;
  if (typeof window !== "undefined") {
    return (
      new URLSearchParams(window.location.search).get("startapp") ||
      new URLSearchParams(window.location.search).get("tgWebAppStartParam")
    );
  }
  return null;
}

export function haptic(style: HapticStyle = "light") {
  try {
    tg()?.HapticFeedback?.impactOccurred(style);
  } catch {
    /* ignore */
  }
}

export function notify(type: "success" | "warning" | "error" = "success") {
  try {
    tg()?.HapticFeedback?.notificationOccurred(type);
  } catch {
    /* ignore */
  }
}

export function openInvoice(link: string): Promise<string> {
  return new Promise((resolve) => {
    const w = tg();
    if (w?.openInvoice) w.openInvoice(link, (status: string) => resolve(status));
    else {
      window.open(link, "_blank");
      resolve("unknown");
    }
  });
}

export function openTelegramLink(url: string) {
  const w = tg();
  if (w?.openTelegramLink) w.openTelegramLink(url);
  else window.open(url, "_blank");
}

interface ShareUser {
  bot_username: string;
  referral_code: string | null;
}

export function inviteLink(
  user: ShareUser,
  kind: "ref" | "squad" | "room",
  code?: string,
): string {
  const ref = user.referral_code || "";
  const param =
    kind === "squad"
      ? `sq-${code}-${ref}`
      : kind === "room"
        ? `rm-${code}-${ref}`
        : `ref-${ref}`;
  return `https://t.me/${user.bot_username}?startapp=${param}`;
}

export function shareInvite(
  user: ShareUser,
  kind: "ref" | "squad" | "room",
  code: string | undefined,
  text: string,
) {
  const url = inviteLink(user, kind, code);
  openTelegramLink(
    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  );
}
