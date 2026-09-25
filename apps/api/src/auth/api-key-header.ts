/** Prefix of every API key, e.g. `sg_AbC…`. */
export const API_KEY_PREFIX = "sg_";

type HeaderValue = string | string[] | null | undefined;

/**
 * The API key a request carries: the `x-api-key` header, or a bearer token that is an API
 * key (MCP clients usually send `Authorization: Bearer …`).
 */
export function apiKeyOf(header: (name: string) => HeaderValue): string | null {
  const first = (value: HeaderValue) => (Array.isArray(value) ? value[0] : value)?.trim();
  const direct = first(header("x-api-key"));
  if (direct) return direct;
  const match = /^Bearer\s+(\S+)$/iu.exec(first(header("authorization")) ?? "");
  return match?.[1]?.startsWith(API_KEY_PREFIX) ? match[1] : null;
}
