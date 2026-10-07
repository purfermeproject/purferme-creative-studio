export { auth as proxy } from "@/auth";

export const config = {
  // Everything except Next internals and static files goes through auth.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
