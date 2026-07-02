import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "@/lib/authorize";

export async function GET(request: NextRequest) {
  const authError = await checkAuth(request);
  if (authError) return authError;
  return NextResponse.json({ message: "Hello, world!" });
}