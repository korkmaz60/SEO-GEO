import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ exists: false, content: null, suggested: null });

    const domain = ctx.project.domain;

    // Mevcut llms.txt'yi kontrol et
    let existing: string | null = null;
    let exists = false;
    try {
      const res = await fetch(`https://${domain}/llms.txt`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        existing = await res.text();
        exists = true;
      }
    } catch { /* */ }

    // Önerilen llms.txt oluştur
    const pages = await db.page.findMany({
      where: { projectId: ctx.projectId, status: "ACTIVE" },
      orderBy: { wordCount: "desc" },
      take: 20,
      select: { url: true, title: true, wordCount: true },
    });

    const suggested = generateLlmsTxt(domain, ctx.project.name, pages);

    return NextResponse.json({ exists, content: existing, suggested });
  } catch (error) {
    console.error("llms.txt API error:", error);
    return NextResponse.json({ error: "llms.txt verisi yüklenemedi" }, { status: 500 });
  }
}

function generateLlmsTxt(domain: string, projectName: string, pages: { url: string; title: string | null; wordCount: number | null }[]) {
  let txt = `# ${projectName}\n`;
  txt += `> ${domain} sitesinin AI arama motorları için içerik rehberi\n\n`;
  txt += `## Ana Sayfalar\n\n`;

  for (const page of pages) {
    const fullUrl = `https://${domain}${page.url}`;
    const title = page.title || page.url;
    const desc = page.wordCount ? `(${page.wordCount} kelime)` : "";
    txt += `- [${title}](${fullUrl}) ${desc}\n`;
  }

  txt += `\n## Hakkında\n\n`;
  txt += `Bu site ${projectName} tarafından yönetilmektedir.\n`;
  txt += `AI arama motorları bu içerikleri kaynak olarak kullanabilir.\n`;
  txt += `\n## İletişim\n\n`;
  txt += `Web: https://${domain}\n`;

  return txt;
}
