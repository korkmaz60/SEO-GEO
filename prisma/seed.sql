-- SEO.GEO Demo Seed Data
-- Önce temizle
TRUNCATE alerts, reports, content_checks, technical_issues, crawl_sessions, citations, ai_visibility, keyword_history, keywords, geo_scores, seo_scores, competitors, pages, projects, users CASCADE;

-- Kullanıcı
-- Şifre: 123456
INSERT INTO users (id, email, name, password, role, "createdAt", "updatedAt")
VALUES ('user_1', 'salih@example.com', 'Salih Korkmaz', '$2b$10$koOpAkZu/guggOERaHBrPeWRWN02pUZweMdH/ITnne/cdK6PplCYy', 'ADMIN', NOW(), NOW());

-- Proje
INSERT INTO projects (id, name, domain, "userId", "createdAt", "updatedAt")
VALUES ('proj_1', 'Ana Site', 'example.com', 'user_1', NOW(), NOW());

-- Sayfalar
INSERT INTO pages (id, "projectId", url, title, "wordCount", status, "createdAt", "updatedAt") VALUES
('page_1', 'proj_1', '/blog/yapay-zeka-seo-rehberi', 'Yapay Zeka SEO Rehberi', 2450, 'ACTIVE', NOW(), NOW()),
('page_2', 'proj_1', '/blog/teknik-seo-checklist-2026', 'Teknik SEO Checklist 2026', 1980, 'ACTIVE', NOW(), NOW()),
('page_3', 'proj_1', '/blog/icerik-stratejisi-plani', 'İçerik Stratejisi Planı', 1750, 'ACTIVE', NOW(), NOW()),
('page_4', 'proj_1', '/blog/schema-markup-rehberi', 'Schema Markup Rehberi', 2100, 'ACTIVE', NOW(), NOW()),
('page_5', 'proj_1', '/blog/e-e-a-t-nedir', 'E-E-A-T Nedir?', 1600, 'ACTIVE', NOW(), NOW()),
('page_6', 'proj_1', '/blog/link-building-stratejileri', 'Link Building Stratejileri', 2200, 'ACTIVE', NOW(), NOW());

-- GEO Skorları (12 haftalık proje trend)
INSERT INTO geo_scores (id, "projectId", "overallScore", "authorityScore", "readabilityScore", "structureScore", "technicalScore", "measuredAt")
SELECT
  'geo_trend_' || w,
  'proj_1',
  58 + w * 1.3,
  60 + w * 1.2,
  68 + w * 1.0,
  52 + w * 1.4,
  50 + w * 1.3,
  NOW() - ((11 - w) * INTERVAL '7 days')
FROM generate_series(0, 11) AS w;

-- GEO Skorları (sayfa bazlı)
INSERT INTO geo_scores (id, "projectId", "pageId", "overallScore", "authorityScore", "readabilityScore", "structureScore", "technicalScore", "measuredAt") VALUES
('geo_p1', 'proj_1', 'page_1', 92, 89, 88, 86, 90, NOW()),
('geo_p2', 'proj_1', 'page_2', 85, 82, 84, 80, 78, NOW()),
('geo_p3', 'proj_1', 'page_3', 78, 75, 80, 72, 70, NOW()),
('geo_p4', 'proj_1', 'page_4', 81, 78, 83, 76, 74, NOW()),
('geo_p5', 'proj_1', 'page_5', 74, 70, 76, 68, 65, NOW()),
('geo_p6', 'proj_1', 'page_6', 69, 66, 72, 64, 60, NOW());

-- SEO Skorları (12 haftalık trend)
INSERT INTO seo_scores (id, "projectId", "overallScore", "healthScore", "speedMobile", "speedDesktop", "lcpValue", "fidValue", "clsValue", "measuredAt")
SELECT
  'seo_trend_' || w,
  'proj_1',
  72 + w,
  80 + w * 0.6,
  68 + w * 0.4,
  86 + w * 0.4,
  2.8 - w * 0.06,
  55 - w * 0.8,
  0.12 - w * 0.003,
  NOW() - ((11 - w) * INTERVAL '7 days')
FROM generate_series(0, 11) AS w;

-- Anahtar Kelimeler
INSERT INTO keywords (id, "projectId", keyword, position, volume, difficulty, "geoScore", trend, "createdAt", "updatedAt") VALUES
('kw_1', 'proj_1', 'yapay zeka seo araçları', 3, 2400, 67, 82, 'UP', NOW(), NOW()),
('kw_2', 'proj_1', 'seo analiz', 5, 8100, 78, 71, 'UP', NOW(), NOW()),
('kw_3', 'proj_1', 'içerik optimizasyonu', 8, 3600, 55, 68, 'STABLE', NOW(), NOW()),
('kw_4', 'proj_1', 'anahtar kelime araştırma', 12, 5400, 72, 45, 'DOWN', NOW(), NOW()),
('kw_5', 'proj_1', 'teknik seo rehberi', 2, 1900, 42, 88, 'UP', NOW(), NOW()),
('kw_6', 'proj_1', 'backlink analizi', 15, 2200, 65, 52, 'STABLE', NOW(), NOW()),
('kw_7', 'proj_1', 'google sıralama faktörleri', 7, 4800, 81, 76, 'UP', NOW(), NOW()),
('kw_8', 'proj_1', 'site hızı optimizasyonu', 4, 3100, 48, 70, 'UP', NOW(), NOW());

-- Keyword History
INSERT INTO keyword_history (id, "keywordId", position, volume, "recordedAt")
SELECT
  'kwh_' || kw.id || '_' || w,
  'kw_' || kw.id,
  kw.base_pos + (11 - w) + floor(random() * 5)::int,
  kw.base_vol + floor(random() * 200 - 100)::int,
  NOW() - ((11 - w) * INTERVAL '7 days')
FROM (VALUES
  (1, 3, 2400), (2, 5, 8100), (3, 8, 3600), (4, 12, 5400),
  (5, 2, 1900), (6, 15, 2200), (7, 7, 4800), (8, 4, 3100)
) AS kw(id, base_pos, base_vol)
CROSS JOIN generate_series(0, 11) AS w;

-- Atıflar (Citations)
INSERT INTO citations (id, "pageId", platform, query, position, "detectedAt") VALUES
('cit_1', 'page_1', 'GOOGLE_AI_OVERVIEW', 'yapay zeka seo araçları nelerdir', 1, NOW() - INTERVAL '5 days'),
('cit_2', 'page_1', 'GOOGLE_AI_OVERVIEW', 'yapay zeka seo araçları nelerdir', 2, NOW() - INTERVAL '12 days'),
('cit_3', 'page_1', 'CHATGPT', 'AI SEO tools 2026', 1, NOW() - INTERVAL '3 days'),
('cit_4', 'page_1', 'CHATGPT', 'AI SEO tools 2026', 3, NOW() - INTERVAL '20 days'),
('cit_5', 'page_1', 'PERPLEXITY', 'en iyi seo araçları', 2, NOW() - INTERVAL '7 days'),
('cit_6', 'page_2', 'GOOGLE_AI_OVERVIEW', 'teknik seo kontrol listesi', 1, NOW() - INTERVAL '2 days'),
('cit_7', 'page_2', 'PERPLEXITY', 'technical SEO checklist', 1, NOW() - INTERVAL '8 days'),
('cit_8', 'page_3', 'CHATGPT', 'içerik stratejisi nasıl oluşturulur', 2, NOW() - INTERVAL '4 days'),
('cit_9', 'page_3', 'CLAUDE', 'content strategy plan', 1, NOW() - INTERVAL '6 days'),
('cit_10', 'page_4', 'GOOGLE_AI_OVERVIEW', 'schema markup nedir', 1, NOW() - INTERVAL '1 day'),
('cit_11', 'page_4', 'CHATGPT', 'structured data SEO', 2, NOW() - INTERVAL '15 days'),
('cit_12', 'page_5', 'PERPLEXITY', 'E-E-A-T nedir', 1, NOW() - INTERVAL '10 days'),
('cit_13', 'page_5', 'CLAUDE', 'experience expertise authority trust', 3, NOW() - INTERVAL '18 days'),
('cit_14', 'page_6', 'GOOGLE_AI_OVERVIEW', 'link building stratejileri 2026', 2, NOW() - INTERVAL '9 days');

-- AI Visibility (12 haftalık trend, 4 platform)
INSERT INTO ai_visibility (id, "projectId", platform, visibility, citations, change, "measuredAt")
SELECT
  'aiv_' || p.idx || '_' || w,
  'proj_1',
  p.platform,
  p.base_vis + w * 1.5 + random() * 3,
  floor(p.base_vis * 0.5 + w * 5 + random() * 10)::int,
  random() * 10 - 2,
  NOW() - ((11 - w) * INTERVAL '7 days')
FROM (VALUES
  (1, 'GOOGLE_AI_OVERVIEW'::"AiPlatform", 72.0),
  (2, 'CHATGPT'::"AiPlatform", 58.0),
  (3, 'PERPLEXITY'::"AiPlatform", 65.0),
  (4, 'CLAUDE'::"AiPlatform", 45.0)
) AS p(idx, platform, base_vis)
CROSS JOIN generate_series(0, 11) AS w;

-- Rakipler
INSERT INTO competitors (id, "projectId", name, domain, "seoScore", "geoScore", traffic, citations, "createdAt", "updatedAt") VALUES
('comp_1', 'proj_1', 'Rakip A', 'rakipa.com', 88, 68, 62000, 289, NOW(), NOW()),
('comp_2', 'proj_1', 'Rakip B', 'rakipb.com', 76, 80, 41000, 412, NOW(), NOW()),
('comp_3', 'proj_1', 'Rakip C', 'rakipc.com', 82, 55, 53000, 178, NOW(), NOW());

-- Crawl Session
INSERT INTO crawl_sessions (id, "projectId", "pagesScanned", "issuesFound", status, "startedAt", "finishedAt")
VALUES ('crawl_1', 'proj_1', 856, 34, 'COMPLETED', NOW() - INTERVAL '2 hours', NOW());

-- Technical Issues
INSERT INTO technical_issues (id, "crawlId", category, severity, message, "createdAt") VALUES
('ti_1', 'crawl_1', 'Meta Başlıklar', 'WARNING', '8 sayfada meta başlık eksik veya çok uzun', NOW()),
('ti_2', 'crawl_1', 'Meta Açıklamalar', 'WARNING', '12 sayfada meta açıklama optimize edilmemiş', NOW()),
('ti_3', 'crawl_1', 'Kırık Linkler', 'CRITICAL', '5 kırık link tespit edildi (404)', NOW()),
('ti_4', 'crawl_1', 'Görsel Alt Metinleri', 'WARNING', '23 görselde alt metin eksik', NOW()),
('ti_5', 'crawl_1', 'Yinelenen İçerik', 'CRITICAL', '3 sayfada canonical tag eksik', NOW()),
('ti_6', 'crawl_1', 'H1 Etiketleri', 'NOTICE', '4 sayfada birden fazla H1 etiketi', NOW()),
('ti_7', 'crawl_1', 'XML Sitemap', 'INFO', '2 sayfa sitemap te eksik', NOW());

-- Alerts
INSERT INTO alerts (id, "projectId", "userId", type, message, read, "createdAt") VALUES
('alert_1', 'proj_1', 'user_1', 'SUCCESS', 'GEO skoru son 7 günde %5 arttı', false, NOW() - INTERVAL '2 hours'),
('alert_2', 'proj_1', 'user_1', 'WARNING', '3 sayfada schema markup eksik tespit edildi', false, NOW() - INTERVAL '5 hours'),
('alert_3', 'proj_1', 'user_1', 'INFO', 'ChatGPT de 12 yeni atıf kazanıldı', false, NOW() - INTERVAL '1 day'),
('alert_4', 'proj_1', 'user_1', 'ERROR', 'Crawl hatası: /api/products 404 dönüyor', true, NOW() - INTERVAL '1 day'),
('alert_5', 'proj_1', 'user_1', 'SUCCESS', 'teknik seo rehberi anahtar kelimesi 2. sıraya yükseldi', true, NOW() - INTERVAL '2 days');

-- Reports
INSERT INTO reports (id, "projectId", "userId", name, type, format, "fileSize", status, "createdAt") VALUES
('rep_1', 'proj_1', 'user_1', 'Aylık SEO & GEO Raporu — Mart 2026', 'FULL', 'pdf', '2.4 MB', 'READY', NOW() - INTERVAL '2 days'),
('rep_2', 'proj_1', 'user_1', 'Haftalık Performans Özeti — Hft 12', 'WEEKLY_SUMMARY', 'pdf', '856 KB', 'READY', NOW() - INTERVAL '6 days'),
('rep_3', 'proj_1', 'user_1', 'GEO Atıf Analizi — Q1 2026', 'GEO', 'pdf', '1.8 MB', 'READY', NOW() - INTERVAL '15 days');
