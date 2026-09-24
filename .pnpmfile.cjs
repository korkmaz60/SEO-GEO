// pnpm hook: adjusts dependency manifests during resolution.
//
// better-auth lists Next.js as an optional peer for its `better-auth/next-js` helpers. pnpm
// resolves optional peers that exist anywhere in the workspace, so the api (which never
// imports those helpers) would get the web app's Next.js and ship it in its image. Nothing
// here uses `better-auth/next-js`; the web app talks to Better Auth through the api.
function readPackage(pkg) {
  if (pkg.name === "better-auth") {
    delete pkg.peerDependencies?.next;
    delete pkg.peerDependenciesMeta?.next;
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
