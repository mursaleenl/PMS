import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Supabase session state is hydrated in the client provider. The workspace
// shell enforces the signed-in boundary while proposal links remain public.
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
