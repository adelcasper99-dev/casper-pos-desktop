import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { domainToUnicode } from "url";

const RESERVED_SLUGS = [
  "hq", "admin", "api", "app", "cloud", "pos", "www", "localhost", "127",
  "login", "signup", "setup", "onboarding", "network-setup", "casper-hq"
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawSlug = searchParams.get("slug");

  if (!rawSlug || rawSlug.trim().length < 3) {
    return NextResponse.json({
      available: false,
      reason: "اسم المعرف قصير جداً (أقل من 3 أحرف)"
    });
  }

  const cleanSlug = rawSlug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "");

  if (cleanSlug.length < 3) {
    return NextResponse.json({
      available: false,
      reason: "يجب أن يحتوي المعرف على حروف إنجليزية وأرقام فقط"
    });
  }

  if (RESERVED_SLUGS.includes(cleanSlug)) {
    return NextResponse.json({
      available: false,
      reason: "هذا المعرف محجوز من قبل النظام"
    });
  }

  const unicodeSlug = domainToUnicode(cleanSlug);

  const existingTenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { slug: cleanSlug },
        { slug: unicodeSlug }
      ]
    }
  });

  if (existingTenant) {
    return NextResponse.json({
      available: false,
      reason: "هذا المعرف مستخدم بالفعل، اختر اسماً آخر"
    });
  }

  return NextResponse.json({
    available: true,
    slug: cleanSlug
  });
}
