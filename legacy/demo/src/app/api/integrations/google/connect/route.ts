import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { getAuthUrl } from "@/lib/google-auth";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Önce bir site ekleyin" }, { status: 400 });

    const url = getAuthUrl(ctx.userId, ctx.projectId);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Google connect error:", error);
    return NextResponse.json({ error: "Bağlantı başlatılamadı" }, { status: 500 });
  }
}
