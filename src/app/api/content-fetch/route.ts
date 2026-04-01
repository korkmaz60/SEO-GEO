import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { url, path } = await req.json();
    let targetUrl = url;
    if (!targetUrl && path && !ctx.noProject) {
      targetUrl = `https://${ctx.project.domain}${path}`;
    }
    if (!targetUrl) return NextResponse.json({ error: "URL gerekli" }, { status: 400 });

    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "SEO-GEO-ContentFetcher/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Sayfa yüklenemedi (HTTP ${res.status})` }, { status: 502 });
    }

    // MIME type kontrolü — sadece HTML kabul et
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("application/xhtml")) {
      return NextResponse.json({
        error: `Bu dosya türü desteklenmiyor (${contentType.split(";")[0]}). Sadece HTML sayfalar analiz edilebilir.`,
      }, { status: 400 });
    }

    const html = await res.text();

    // Başlık
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";

    // Meta description
    const description = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i)?.[1]?.trim() || "";

    // Body içeriğini temiz text'e çevir
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] || html;

    const text = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_m, code) => {
        const num = parseInt(code);
        return num > 31 && num < 127 ? String.fromCharCode(num) : " ";
      })
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      url: targetUrl,
      title,
      description,
      content: text,
      wordCount,
      html: html.slice(0, 50000),
    });
  } catch (error) {
    console.error("Content fetch error:", error);
    const message = error instanceof DOMException && error.name === "TimeoutError"
      ? "Sayfa yanıt vermedi (15s timeout). Sayfa erişilebilir olduğundan emin olun."
      : "Sayfa çekilemedi — URL erişilebilir olmalı";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
