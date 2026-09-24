import ipaddr from "ipaddr.js";

/**
 * True only for globally routable unicast addresses. Loopback, private (RFC 1918),
 * link-local (including cloud metadata at 169.254.169.254), carrier-grade NAT, multicast,
 * reserved, documentation, IPv6 unique-local, NAT64 and 6to4/Teredo ranges are all refused.
 * IPv4-mapped IPv6 addresses (`::ffff:10.0.0.1`) are checked as the IPv4 address they carry.
 */
export function isPublicIpAddress(address: string): boolean {
  const candidate = stripBrackets(address);
  if (!ipaddr.isValid(candidate)) return false;
  return ipaddr.process(candidate).range() === "unicast";
}

export function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}
