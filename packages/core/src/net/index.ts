// Node-only helpers for outbound requests. Import from "@seo-geo/core/net".
export { isPublicIpAddress } from "./ip.js";
export {
  DEFAULT_ALLOWED_PORTS,
  UnsafeUrlError,
  assertAllowedUrl,
  assertPublicUrl,
  resolvePublicAddresses,
  type LookupFunction,
  type PublicUrlCheckOptions,
  type ResolvedAddress,
  type UnsafeUrlReason,
  type UrlPolicyOptions,
} from "./url-policy.js";
