import { DEFAULT_LOCALE, LocaleSchema, type Locale } from "@seo-geo/contracts";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export function resolveLocale(value: unknown): Locale {
  const parsed = LocaleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_LOCALE;
}

const COPY = {
  tr: {
    verify: {
      subject: "E-posta adresinizi doğrulayın",
      intro: "SEO-GEO hesabınızı etkinleştirmek için e-posta adresinizi doğrulayın.",
      action: "E-postamı doğrula",
      footer: "Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.",
    },
    reset: {
      subject: "Şifrenizi sıfırlayın",
      intro: "Şifrenizi sıfırlamak için aşağıdaki bağlantıyı kullanın. Bağlantı 1 saat geçerlidir.",
      action: "Şifremi sıfırla",
      footer: "Bu isteği siz yapmadıysanız şifreniz değişmez; bu e-postayı yok sayabilirsiniz.",
    },
    invite: {
      subject: (workspace: string) => `${workspace} çalışma alanına davet edildiniz`,
      intro: (inviter: string, workspace: string, role: string) =>
        `${inviter}, sizi SEO-GEO'daki ${workspace} çalışma alanına ${role} rolüyle davet etti.`,
      action: "Daveti görüntüle",
      footer: "Davet 7 gün geçerlidir.",
    },
    roles: { owner: "sahip", admin: "yönetici", member: "üye", viewer: "izleyici" },
  },
  en: {
    verify: {
      subject: "Verify your email address",
      intro: "Verify your email address to activate your SEO-GEO account.",
      action: "Verify email",
      footer: "If you did not request this, you can ignore this email.",
    },
    reset: {
      subject: "Reset your password",
      intro: "Use the link below to reset your password. It is valid for 1 hour.",
      action: "Reset password",
      footer: "If you did not request this, your password stays the same; ignore this email.",
    },
    invite: {
      subject: (workspace: string) => `You are invited to ${workspace}`,
      intro: (inviter: string, workspace: string, role: string) =>
        `${inviter} invited you to the ${workspace} workspace on SEO-GEO as ${role}.`,
      action: "View invitation",
      footer: "The invitation is valid for 7 days.",
    },
    roles: { owner: "owner", admin: "admin", member: "member", viewer: "viewer" },
  },
} as const;

export function verifyEmail(url: string, locale: Locale): EmailContent {
  const copy = COPY[locale].verify;
  return actionEmail(copy.subject, copy.intro, copy.action, url, copy.footer);
}

export function resetPasswordEmail(url: string, locale: Locale): EmailContent {
  const copy = COPY[locale].reset;
  return actionEmail(copy.subject, copy.intro, copy.action, url, copy.footer);
}

export function invitationEmail(
  input: { url: string; workspace: string; inviter: string; role: string },
  locale: Locale,
): EmailContent {
  const copy = COPY[locale];
  const role = copy.roles[input.role as keyof typeof copy.roles] ?? input.role;
  return actionEmail(
    copy.invite.subject(input.workspace),
    copy.invite.intro(input.inviter, input.workspace, role),
    copy.invite.action,
    input.url,
    copy.invite.footer,
  );
}

function actionEmail(
  subject: string,
  intro: string,
  action: string,
  url: string,
  footer: string,
): EmailContent {
  const text = `${intro}\n\n${action}: ${url}\n\n${footer}\n`;
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#171717">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;padding:32px">
<tr><td>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px">${escapeHtml(intro)}</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#155dfc;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${escapeHtml(action)}</a></p>
<p style="font-size:12px;line-height:1.6;color:#737373;margin:0 0 8px;word-break:break-all">${escapeHtml(url)}</p>
<p style="font-size:12px;line-height:1.6;color:#737373;margin:0">${escapeHtml(footer)}</p>
</td></tr>
</table>
</body></html>`;
  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
