import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { getBacklinkSummary } from "@/lib/dataforseo";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    if (!process.env.DATAFORSEO_LOGIN) {
      return NextResponse.json({ error: "DataForSEO yapılandırılmamış" }, { status: 400 });
    }

    const result = await getBacklinkSummary(ctx.project.domain);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Backlink error:", error);
    return NextResponse.json({ error: "Backlink verileri alınamadı" }, { status: 500 });
  }
}
