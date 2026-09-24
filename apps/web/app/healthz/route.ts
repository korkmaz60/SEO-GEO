/** Liveness for container health checks; does not depend on the api. */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok", service: "seo-geo-web" });
}
