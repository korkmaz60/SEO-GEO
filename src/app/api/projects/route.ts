import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const projects = await db.project.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Projects GET error:", error);
    return NextResponse.json({ error: "Projeler yüklenemedi" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { name, domain } = await req.json();

    if (!name || !domain) {
      return NextResponse.json({ error: "Proje adı ve domain zorunludur" }, { status: 400 });
    }

    // Domain temizle
    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

    const existing = await db.project.findFirst({
      where: { userId: session.user.id, domain: cleanDomain },
    });

    if (existing) {
      return NextResponse.json({ error: "Bu domain zaten ekli" }, { status: 409 });
    }

    const project = await db.project.create({
      data: {
        name,
        domain: cleanDomain,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Projects POST error:", error);
    return NextResponse.json({ error: "Proje oluşturulamadı" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Proje ID gerekli" }, { status: 400 });

    // Kullanıcının projesi mi kontrol et
    const project = await db.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!project) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 404 });

    // Kullanıcının en az 1 projesi kalmalı
    const count = await db.project.count({ where: { userId: session.user.id } });
    if (count <= 1) {
      return NextResponse.json({ error: "En az bir projeniz olmalıdır" }, { status: 400 });
    }

    await db.project.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Projects DELETE error:", error);
    return NextResponse.json({ error: "Proje silinemedi" }, { status: 500 });
  }
}
