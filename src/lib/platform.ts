import { cookies } from "next/headers";
import { isPlatform, type Platform } from "./types";

export const PLATFORM_COOKIE = "platform";

export async function getPlatform(): Promise<Platform> {
  const value = (await cookies()).get(PLATFORM_COOKIE)?.value;
  return isPlatform(value) ? value : "meta";
}
