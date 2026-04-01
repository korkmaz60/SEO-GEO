import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ integrations: {}, noProject: true });

    const integrations = await db.integration.findMany({
      where: { projectId: ctx.projectId },
    });

    const status: Record<string, { connected: boolean; propertyUrl?: string | null }> = {
      GOOGLE_SEARCH_CONSOLE: { connected: false },
      GOOGLE_ANALYTICS: { connected: false },
    };

    for (const i of integrations) {
      status[i.provider] = {
        connected: i.connected && !!i.refreshToken,
        propertyUrl: i.propertyUrl,
      };
    }

    // API key ve AI provider durumları (server-side env check)
    const apiKeys: Record<string, boolean> = {
      SERPAPI: !!process.env.SERPAPI_KEY,
      DATAFORSEO: !!process.env.DATAFORSEO_LOGIN && !!process.env.DATAFORSEO_PASSWORD,
    };

    const aiProviders: Record<string, boolean> = {
      CLAUDE: !!process.env.ANTHROPIC_API_KEY,
      GEMINI: !!process.env.GEMINI_API_KEY,
      OPENAI: !!process.env.OPENAI_API_KEY,
    };

    return NextResponse.json({ integrations: status, apiKeys, aiProviders });
  } catch (error) {
    console.error("Integration status error:", error);
    return NextResponse.json({ error: "Durum alınamadı" }, { status: 500 });
  }
}
