import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { content, provider, model } = await req.json();
    if (!content || content.trim().length < 50) {
      return NextResponse.json({ error: "En az 50 karakter içerik gerekli" }, { status: 400 });
    }

    // AI analiz dene
    try {
      const { analyzeContentWithAi, getDefaultProvider } = await import("@/lib/ai");
      const activeProvider = provider || getDefaultProvider();
      if (activeProvider) {
        const aiResult = await analyzeContentWithAi(content, activeProvider, model);
        if (aiResult) return NextResponse.json({ ...aiResult, aiPowered: true });
      }
    } catch (e) {
      console.error("AI fallback:", e);
    }

    return NextResponse.json({ ...analyzeLocal(content), aiPowered: false });
  } catch (error) {
    console.error("Content analyze error:", error);
    return NextResponse.json({ error: "Analiz başarısız" }, { status: 500 });
  }
}

function analyzeLocal(text: string) {
  const words = text.trim().split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const headings = (text.match(/^#{1,6}\s.+/gm) || []).length;
  const lists = (text.match(/^[-*]\s|^\d+\.\s/gm) || []).length;
  const links = (text.match(/https?:\/\/|www\./g) || []).length;
  const numbers = (text.match(/\d+[%.,]?\d*/g) || []).length;
  const wc = words.length;
  const sc = sentences.length;
  const awps = sc > 0 ? wc / sc : 0;

  // Türkçe okunabilirlik formülü — Ateşman (1997) Türkçe adaptasyonu
  // Cümle uzunluğu + ortalama kelime uzunluğu bazlı
  // İdeal: awps 12-18, avgWordLen 5-7 (Türkçe)
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  const avgWordLen = wc > 0 ? totalChars / wc : 0;
  // Ateşman formülü: 198.825 - 40.175 * (syl/wc) - 2.610 * (wc/sc)
  // Basitleştirilmiş Türkçe versiyonu (kelime uzunluğu bazlı, hece yerine):
  let readability: number;
  if (sc === 0) {
    readability = 0;
  } else {
    // Cümle uzunluğu skoru (ideal 12-18 kelime)
    let sentenceScore: number;
    if (awps >= 12 && awps <= 18) sentenceScore = 50;
    else if (awps >= 8 && awps <= 25) sentenceScore = 35;
    else if (awps < 8) sentenceScore = 20; // çok kısa cümleler
    else sentenceScore = 15; // çok uzun cümleler

    // Kelime uzunluğu skoru (Türkçe ort. 6-7 karakter)
    let wordScore: number;
    if (avgWordLen >= 4 && avgWordLen <= 8) wordScore = 50;
    else if (avgWordLen >= 3 && avgWordLen <= 10) wordScore = 35;
    else wordScore = 20;

    readability = Math.max(0, Math.min(100, sentenceScore + wordScore));
  }

  // ========== AUTHORITY SKORU ==========
  // Somut referans ve veri kontrolü — keyword stuffing'e dayanıklı
  const hasSpecificNumbers = (text.match(/\b\d{4}\b|%\d+|\d+\.\d+|₺\d+|\$\d+/g) || []).length >= 2;
  const hasSourceRef = /araştırma(ya|sına|lar)|çalışma(ya|sına)|rapor(una|a)|verilerine|istatistik/i.test(text);
  const hasQuotation = (text.match(/[""«»]/g) || []).length >= 2;
  const hasExpertContext = /profesör|dr\.\s|doçent|uzman(lar|ın)|deneyim(li|im)|sertifika/i.test(text);
  const hasCitation = /\[\d+\]|\(\d{4}\)|\bkaynak(lar|ça)?\b|\breferans(lar)?\b|'[ea]\s+göre\b|araştırmasına göre|verilerine göre/i.test(text);
  const hasDateRef = /\b(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\s+\d{4}\b/i.test(text) ||
    /\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(text);

  let auth = 15;
  if (hasSpecificNumbers) auth += 15;
  if (hasSourceRef) auth += 15;
  if (hasQuotation) auth += 10;
  if (hasExpertContext) auth += 15;
  if (hasCitation) auth += 10;
  if (hasDateRef) auth += 10;
  if (wc >= 2000) auth += 15;
  else if (wc >= 1000) auth += 10;
  else if (wc >= 500) auth += 5;
  if (links >= 3) auth += 5;
  auth = Math.min(100, auth);

  // ========== STRUCTURE SKORU ==========
  // Soru formatındaki başlıklar (AI motorları soru-cevap formatını sever)
  const questionHeadings = (text.match(/^#{1,6}\s.*\?/gm) || []).length;

  let struct = 15;
  if (headings >= 5) struct += 20;
  else if (headings >= 3) struct += 15;
  else if (headings >= 1) struct += 8;
  if (questionHeadings >= 2) struct += 15;
  else if (questionHeadings >= 1) struct += 8;
  if (lists >= 3) struct += 15;
  else if (lists >= 1) struct += 8;
  if (paragraphs.length >= 6) struct += 15;
  else if (paragraphs.length >= 4) struct += 10;
  // Featured snippet uygunluğu — tanım paragrafları (kısa, öz)
  const shortParas = paragraphs.filter(p => {
    const pw = p.split(/\s+/).length;
    return pw >= 20 && pw <= 60;
  });
  if (shortParas.length >= 2) struct += 10;
  struct = Math.min(100, struct);

  // ========== TECHNICAL SKORU ==========
  let tech = 30;
  if (links >= 3) tech += 15;
  else if (links >= 1) tech += 8;
  if (headings >= 3) tech += 15;
  else if (headings >= 1) tech += 8;
  if (wc >= 2000) tech += 20;
  else if (wc >= 1000) tech += 15;
  else if (wc >= 500) tech += 8;
  // Heading hiyerarşisi kontrolü (basit)
  const headingLevels = [...text.matchAll(/^(#{1,6})\s/gm)].map(m => m[1].length);
  let hasGoodHierarchy = true;
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i] > headingLevels[i - 1] + 1) {
      hasGoodHierarchy = false;
      break;
    }
  }
  if (headingLevels.length >= 2 && hasGoodHierarchy) tech += 12;
  tech = Math.min(100, tech);

  const overall = Math.round(auth * 0.3 + readability * 0.25 + struct * 0.25 + tech * 0.2);

  // ========== ÖNERİLER ==========
  const suggestions: { type: string; text: string }[] = [];

  // Critical
  if (wc < 500) suggestions.push({ type: "critical", text: `İçerik çok kısa (${wc} kelime) — kapsamlı konular için minimum 1000-1500 kelime hedefleyin` });
  if (!hasExpertContext && !hasSourceRef) suggestions.push({ type: "critical", text: "E-E-A-T sinyalleri eksik — yazar bilgisi, uzmanlık referansları, kaynak atıfları ekleyin" });

  // Warnings
  if (wc >= 500 && wc < 1500) suggestions.push({ type: "warning", text: `İçerik orta uzunlukta (${wc} kelime) — konuyu derinleştirmek AI atıflanma şansını artırır` });
  if (hasSpecificNumbers && numbers < 5) suggestions.push({ type: "warning", text: "Daha fazla sayısal veri ekleyin — istatistikler, yüzdeler, tarihler AI motorlarının sevdiği bilgi türleridir" });
  if (questionHeadings === 0 && headings >= 1) suggestions.push({ type: "warning", text: "Alt başlıkları soru formatına çevirin (ör: 'SEO Nedir?' yerine 'SEO') — AI motorları soru-cevap eşleştirmesi yapar" });
  if (headings < 3) suggestions.push({ type: "warning", text: "Daha fazla alt başlık (H2/H3) kullanın — her bölüm bağımsız alıntılanabilir olmalı" });
  if (lists < 2) suggestions.push({ type: "warning", text: "Listeler ekleyin — numaralı adımlar ve madde işaretleri Featured Snippet'larda öne çıkar" });
  if (!hasCitation && !hasSourceRef) suggestions.push({ type: "warning", text: "Kaynak referansları ekleyin — '[1]', 'X araştırmasına göre' gibi atıflar güvenilirliği artırır" });

  // Success
  if (wc >= 1500) suggestions.push({ type: "success", text: `Yeterli içerik uzunluğu (${wc} kelime) — konu kapsamı iyi` });
  if (hasExpertContext) suggestions.push({ type: "success", text: "E-E-A-T sinyalleri mevcut — uzman referansları içeriğin güvenilirliğini artırıyor" });
  if (headings >= 3) suggestions.push({ type: "success", text: "İyi başlık yapısı — içerik bölümlenmesi AI tarafından kolay anlaşılabilir" });
  if (hasSpecificNumbers) suggestions.push({ type: "success", text: "Sayısal veriler mevcut — somut bilgiler AI motorları tarafından tercih ediliyor" });

  // İlk paragraf değerlendirmesi
  const firstPara = paragraphs[0]?.trim() || "";
  const firstParaWords = firstPara.split(/\s+/).length;
  let rewriteHint = "";
  if (firstParaWords > 60) {
    rewriteHint = "İlk paragraf çok uzun — AI motorları ilk 2-3 cümleden alıntı yapar. İlk paragrafı 40-50 kelimelik doğrudan bir tanım/özet olarak yeniden yazın.";
  } else if (firstParaWords < 15) {
    rewriteHint = "İlk paragraf çok kısa — konunun ne olduğunu, neden önemli olduğunu kısaca açıklayan 2-3 cümle ekleyin.";
  }

  return {
    scores: { overall, authority: auth, readability, structure: struct, technical: tech },
    metrics: {
      wordCount: wc,
      sentenceCount: sc,
      paragraphCount: paragraphs.length,
      headingCount: headings,
      questionHeadingCount: questionHeadings,
      listCount: lists,
      linkCount: links,
      numberCount: numbers,
      avgWordsPerSentence: Math.round(awps),
    },
    suggestions,
    rewriteSuggestion: rewriteHint || null,
    summary: `GEO skoru ${overall}/100. ${overall >= 75 ? "AI atıflanma potansiyeli yüksek." : overall >= 50 ? "İyileştirmelerle AI görünürlüğü artırılabilir." : "Ciddi iyileştirme gerekli — içerik AI motorları için optimize edilmemiş."}`,
  };
}
