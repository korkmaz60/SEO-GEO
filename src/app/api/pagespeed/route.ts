import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { db } from "@/lib/db";

const PAGESPEED_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { url } = await req.json();
    const targetUrl = url || `https://${ctx.project.domain}`;

    // Mobil ve masaüstü paralel
    const apiKey = process.env.GOOGLE_PAGESPEED_KEY || process.env.GEMINI_API_KEY || "";
    const keyParam = apiKey ? `&key=${apiKey}` : "";
    const [mobileRes, desktopRes] = await Promise.all([
      fetch(`${PAGESPEED_API}?url=${encodeURIComponent(targetUrl)}&strategy=mobile&category=performance${keyParam}`),
      fetch(`${PAGESPEED_API}?url=${encodeURIComponent(targetUrl)}&strategy=desktop&category=performance${keyParam}`),
    ]);

    if (!mobileRes.ok || !desktopRes.ok) {
      return NextResponse.json({ error: "PageSpeed API hatası — URL erişilebilir olmalı" }, { status: 502 });
    }

    const [mobileData, desktopData] = await Promise.all([mobileRes.json(), desktopRes.json()]);

    const mobileScore = Math.round((mobileData.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
    const desktopScore = Math.round((desktopData.lighthouseResult?.categories?.performance?.score ?? 0) * 100);

    // Core Web Vitals
    const mobileAudits = mobileData.lighthouseResult?.audits || {};
    const lcp = mobileAudits["largest-contentful-paint"]?.numericValue
      ? Number((mobileAudits["largest-contentful-paint"].numericValue / 1000).toFixed(2))
      : null;
    const cls = mobileAudits["cumulative-layout-shift"]?.numericValue
      ? Number(mobileAudits["cumulative-layout-shift"].numericValue.toFixed(3))
      : null;
    // INP (Interaction to Next Paint) — FID'in yerini aldı (Mart 2024'ten itibaren)
    // Eğer INP yoksa TBT'yi fallback olarak kullan
    const inp = mobileAudits["interaction-to-next-paint"]?.numericValue
      ? Math.round(mobileAudits["interaction-to-next-paint"].numericValue)
      : null;
    const tbt = mobileAudits["total-blocking-time"]?.numericValue
      ? Math.round(mobileAudits["total-blocking-time"].numericValue)
      : null;
    const interactivity = inp ?? tbt;

    // SEO skorunu hesapla — PageSpeed + CWV kombinasyonu
    const speedAvg = Math.round((mobileScore + desktopScore) / 2);

    // CWV bonus/penalty
    let cwvAdjustment = 0;
    if (lcp !== null) {
      if (lcp <= 2.5) cwvAdjustment += 5;
      else if (lcp > 4) cwvAdjustment -= 10;
      else cwvAdjustment -= 5;
    }
    if (cls !== null) {
      if (cls <= 0.1) cwvAdjustment += 3;
      else if (cls > 0.25) cwvAdjustment -= 8;
      else cwvAdjustment -= 3;
    }
    if (interactivity !== null) {
      if (interactivity <= 200) cwvAdjustment += 2;
      else if (interactivity > 500) cwvAdjustment -= 7;
      else cwvAdjustment -= 2;
    }

    const overallScore = Math.max(0, Math.min(100, speedAvg + cwvAdjustment));

    // Health score — teknik sağlık ayrı bir metrik (crawl issues'a göre hesaplanmalı ama burada sadece speed testi)
    // Önceki crawl session'dan issue bilgisi çek
    const latestCrawl = await db.crawlSession.findFirst({
      where: { projectId: ctx.projectId },
      orderBy: { startedAt: "desc" },
    });
    const issueCount = latestCrawl?.issuesFound ?? 0;
    const healthScore = Math.max(0, 100 - issueCount * 5);

    await db.seoScore.create({
      data: {
        projectId: ctx.projectId,
        overallScore,
        healthScore,
        speedMobile: mobileScore,
        speedDesktop: desktopScore,
        lcpValue: lcp,
        fidValue: interactivity, // INP veya TBT
        clsValue: cls,
      },
    });

    return NextResponse.json({
      url: targetUrl,
      mobile: {
        score: mobileScore,
        lcp,
        cls,
        inp,
        tbt,
      },
      desktop: {
        score: desktopScore,
      },
      overall: overallScore,
      healthScore,
      coreWebVitals: {
        lcp: { value: lcp, status: (lcp ?? 3) <= 2.5 ? "good" : (lcp ?? 3) <= 4 ? "needs-improvement" : "poor" },
        inp: { value: interactivity, status: (interactivity ?? 300) <= 200 ? "good" : (interactivity ?? 300) <= 500 ? "needs-improvement" : "poor" },
        cls: { value: cls, status: (cls ?? 0.2) <= 0.1 ? "good" : (cls ?? 0.2) <= 0.25 ? "needs-improvement" : "poor" },
      },
      savedToDb: true,
    });
  } catch (error) {
    console.error("PageSpeed API error:", error);
    return NextResponse.json({ error: "PageSpeed analizi başarısız" }, { status: 500 });
  }
}
