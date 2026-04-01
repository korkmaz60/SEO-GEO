"use client";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ReportData {
  projectName: string;
  domain: string;
  date: string;
  seoScore: number;
  geoScore: number;
  unifiedScore: number;
  keywords: { keyword: string; position: number | null; volume: number | null; geoScore: number | null }[];
  issues: { category: string; severity: string; message: string }[];
  pageSpeed: { mobile: number; desktop: number } | null;
}

export function generatePdfReport(data: ReportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(15, 15, 25);
  doc.rect(0, 0, pageWidth, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text("SEO.GEO", 14, 18);
  doc.setFontSize(10);
  doc.text("AI-Powered SEO & GEO Analytics Report", 14, 26);
  doc.setFontSize(8);
  doc.text(`${data.projectName} (${data.domain}) — ${data.date}`, 14, 34);

  // Skorlar
  doc.setTextColor(0, 0, 0);
  let y = 50;

  doc.setFontSize(14);
  doc.text("Performans Ozeti", 14, y);
  y += 10;

  doc.setFontSize(10);
  doc.text(`Birlesik Skor: ${data.unifiedScore}/100`, 14, y);
  doc.text(`SEO Skor: ${data.seoScore}/100`, 80, y);
  doc.text(`GEO Skor: ${data.geoScore}/100`, 146, y);
  y += 8;

  if (data.pageSpeed) {
    doc.text(`Sayfa Hizi — Mobil: ${data.pageSpeed.mobile}/100, Masaustu: ${data.pageSpeed.desktop}/100`, 14, y);
    y += 12;
  } else {
    y += 4;
  }

  // Keywords tablosu
  if (data.keywords.length > 0) {
    doc.setFontSize(14);
    doc.text("Anahtar Kelimeler", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Anahtar Kelime", "Sira", "Hacim", "GEO Skor"]],
      body: data.keywords.slice(0, 30).map((kw) => [
        kw.keyword,
        kw.position ? `#${kw.position}` : "—",
        kw.volume?.toLocaleString("tr-TR") ?? "—",
        kw.geoScore?.toString() ?? "—",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 15, 25] },
      margin: { left: 14 },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  // Teknik sorunlar
  if (data.issues.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }

    doc.setFontSize(14);
    doc.text("Teknik SEO Sorunlari", 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Kategori", "Oncelik", "Aciklama"]],
      body: data.issues.map((i) => [i.category, i.severity, i.message]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 15, 25] },
      margin: { left: 14 },
      columnStyles: {
        1: {
          cellWidth: 25,
          fontStyle: "bold",
        },
      },
    });
  }

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`SEO.GEO Analytics — ${data.date}`, 14, doc.internal.pageSize.getHeight() - 10);

  doc.save(`seogeo-rapor-${data.domain}-${data.date}.pdf`);
}
