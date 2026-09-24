import "server-only";
import nodemailer from "nodemailer";

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

export async function sendEmail(to: string, subject: string, html: string) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[Email] SMTP not configured, skipping:", subject);
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "SEO.GEO <noreply@seogeo.app>",
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("[Email] Send failed:", error);
    return false;
  }
}

export function buildWeeklyReportEmail(data: {
  domain: string;
  seoScore: number;
  geoScore: number;
  keywords: number;
  issues: number;
}) {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#0a0a0a;color:#fafafa;border-radius:12px;">
      <div style="text-align:center;padding:20px 0;border-bottom:1px solid #222;">
        <h1 style="margin:0;font-size:24px;">SEO<span style="color:#6366f1;">.</span>GEO</h1>
        <p style="margin:5px 0 0;color:#888;font-size:12px;">Haftalık Performans Raporu</p>
      </div>
      <div style="padding:20px 0;">
        <h2 style="font-size:16px;margin:0 0 15px;">${data.domain}</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:10px;text-align:center;background:#111;border-radius:8px;">
              <div style="font-size:28px;font-weight:bold;">${data.seoScore}</div>
              <div style="font-size:11px;color:#888;">SEO Skor</div>
            </td>
            <td style="width:10px;"></td>
            <td style="padding:10px;text-align:center;background:#111;border-radius:8px;">
              <div style="font-size:28px;font-weight:bold;">${data.geoScore}</div>
              <div style="font-size:11px;color:#888;">GEO Skor</div>
            </td>
          </tr>
        </table>
        <div style="margin-top:15px;padding:12px;background:#111;border-radius:8px;">
          <p style="margin:0;font-size:13px;"><strong>${data.keywords}</strong> anahtar kelime takip ediliyor</p>
          <p style="margin:5px 0 0;font-size:13px;"><strong>${data.issues}</strong> teknik sorun tespit edildi</p>
        </div>
      </div>
      <div style="text-align:center;padding:15px 0;border-top:1px solid #222;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}" style="color:#6366f1;text-decoration:none;font-size:13px;">Dashboard'a Git →</a>
      </div>
    </div>
  `;
}
