import { NextResponse } from "next/server";

import {
  applyActiveProjectCookie,
  getActiveProjectIdFromCookies,
  pickActiveProject,
} from "@/lib/active-project";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const projects = await db.project.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });

    const activeProjectIdFromCookie = await getActiveProjectIdFromCookies();
    const activeProject = pickActiveProject(projects, activeProjectIdFromCookie);
    const response = NextResponse.json({
      projects,
      activeProjectId: activeProject?.id ?? null,
    });

    return applyActiveProjectCookie(response, activeProject?.id ?? null);
  } catch (error) {
    console.error("Projects GET error:", error);
    return NextResponse.json({ error: "Projeler yuklenemedi" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { name, domain } = await req.json();

    if (!name || !domain) {
      return NextResponse.json({ error: "Proje adi ve domain zorunludur" }, { status: 400 });
    }

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

    const response = NextResponse.json({ project, activeProjectId: project.id }, { status: 201 });
    return applyActiveProjectCookie(response, project.id);
  } catch (error) {
    console.error("Projects POST error:", error);
    return NextResponse.json({ error: "Proje olusturulamadi" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { projectId } = await req.json();
    if (!projectId) {
      return NextResponse.json({ error: "Proje ID gerekli" }, { status: 400 });
    }

    const project = await db.project.findFirst({
      where: { id: projectId, userId: session.user.id },
      select: { id: true, name: true, domain: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Proje bulunamadi" }, { status: 404 });
    }

    const response = NextResponse.json({
      success: true,
      activeProjectId: project.id,
      project,
    });

    return applyActiveProjectCookie(response, project.id);
  } catch (error) {
    console.error("Projects PATCH error:", error);
    return NextResponse.json({ error: "Aktif proje guncellenemedi" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Proje ID gerekli" }, { status: 400 });

    const project = await db.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!project) return NextResponse.json({ error: "Proje bulunamadi" }, { status: 404 });

    const count = await db.project.count({ where: { userId: session.user.id } });
    if (count <= 1) {
      return NextResponse.json({ error: "En az bir projeniz olmali" }, { status: 400 });
    }

    await db.project.delete({ where: { id } });

    const remainingProjects = await db.project.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
    });
    const activeProjectIdFromCookie = await getActiveProjectIdFromCookies();
    const nextActiveProject =
      activeProjectIdFromCookie === id
        ? remainingProjects[0] ?? null
        : pickActiveProject(remainingProjects, activeProjectIdFromCookie);

    const response = NextResponse.json({
      success: true,
      activeProjectId: nextActiveProject?.id ?? null,
    });

    return applyActiveProjectCookie(response, nextActiveProject?.id ?? null);
  } catch (error) {
    console.error("Projects DELETE error:", error);
    return NextResponse.json({ error: "Proje silinemedi" }, { status: 500 });
  }
}
