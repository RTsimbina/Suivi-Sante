import { NextRequest, NextResponse } from "next/server";
import { isLockedOut } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ locked: false }, { status: 200 });
    }
    const status = isLockedOut(String(email).toLowerCase().trim());
    return NextResponse.json(status);
  } catch {
    return NextResponse.json({ locked: false }, { status: 200 });
  }
}