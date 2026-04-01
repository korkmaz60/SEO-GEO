import { NextResponse } from "next/server";
import { getProviderList, getDefaultProvider } from "@/lib/ai";

export async function GET() {
  return NextResponse.json({
    providers: getProviderList(),
    default: getDefaultProvider(),
  });
}
