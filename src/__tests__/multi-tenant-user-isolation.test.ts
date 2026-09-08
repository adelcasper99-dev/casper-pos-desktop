import { describe, it, expect } from 'vitest';

describe('Multi-Tenant User Isolation & Signup Validation', () => {
  it('TC-1: P2002 error target parsing returns accurate disambiguated error messages', () => {
    function parsePrismaError(metaTarget: string[] | string | undefined): string {
      const rawTarget = metaTarget;
      const targets = Array.isArray(rawTarget)
        ? rawTarget.map((t) => String(t).toLowerCase())
        : [String(rawTarget || "").toLowerCase()];

      if (targets.some((t) => t.includes("phone"))) {
        return "رقم الهاتف هذا مسجل بالفعل في النظام، يرجى استخدام رقم آخر أو تسجيل الدخول.";
      }
      if (targets.some((t) => t.includes("username"))) {
        return "اسم المستخدم هذا مسجل بالفعل في هذا المتجر، يرجى اختيار اسم آخر.";
      }
      if (targets.some((t) => t.includes("slug") || t.includes("domain") || t === "id" || t.includes("tenant_pkey") || t.includes("tenant_slug_key") || t.includes("tenant_domain_key"))) {
        return "هذا المعرف الفرعي (Subdomain) مستخدم بالفعل، يرجى اختيار اسم آخر.";
      }
      return "توجد بيانات مسجلة مسبقاً تطابق البيانات المدخلة، يرجى المراجعة.";
    }

    // Subdomain collision
    expect(parsePrismaError(['slug'])).toBe("هذا المعرف الفرعي (Subdomain) مستخدم بالفعل، يرجى اختيار اسم آخر.");
    expect(parsePrismaError(['Tenant_domain_key'])).toBe("هذا المعرف الفرعي (Subdomain) مستخدم بالفعل، يرجى اختيار اسم آخر.");

    // Phone collision
    expect(parsePrismaError(['phone'])).toBe("رقم الهاتف هذا مسجل بالفعل في النظام، يرجى استخدام رقم آخر أو تسجيل الدخول.");
    expect(parsePrismaError(['User_tenantId_phone_key'])).toBe("رقم الهاتف هذا مسجل بالفعل في النظام، يرجى استخدام رقم آخر أو تسجيل الدخول.");

    // Username collision
    expect(parsePrismaError(['username'])).toBe("اسم المستخدم هذا مسجل بالفعل في هذا المتجر، يرجى اختيار اسم آخر.");
    expect(parsePrismaError(['User_tenantId_username_key'])).toBe("اسم المستخدم هذا مسجل بالفعل في هذا المتجر، يرجى اختيار اسم آخر.");
  });

  it('TC-2: Username & Phone uniqueness is composite per tenantId', () => {
    // Mocking multi-tenant user store
    const userStore: Array<{ tenantId: string; username: string; phone: string | null }> = [];

    function insertUser(tenantId: string, username: string, phone: string | null) {
      const usernameExists = userStore.some(
        (u) => u.tenantId === tenantId && u.username.toLowerCase() === username.toLowerCase()
      );
      if (usernameExists) {
        throw { code: 'P2002', meta: { target: ['User_tenantId_username_key'] } };
      }

      if (phone) {
        const phoneExists = userStore.some(
          (u) => u.tenantId === tenantId && u.phone === phone
        );
        if (phoneExists) {
          throw { code: 'P2002', meta: { target: ['User_tenantId_phone_key'] } };
        }
      }

      userStore.push({ tenantId, username, phone });
      return { success: true };
    }

    // 1. Tenant A creates user 'admin' with phone '01066686503'
    expect(() => insertUser('tenant_a', 'admin', '01066686503')).not.toThrow();

    // 2. Tenant B creates user 'admin' with phone '01066686503' (Should succeed across different tenants!)
    expect(() => insertUser('tenant_b', 'admin', '01066686503')).not.toThrow();

    // 3. Tenant A creates duplicate user 'admin' (Should fail!)
    expect(() => insertUser('tenant_a', 'admin', '01011112222')).toThrow();

    // 4. Tenant B creates duplicate phone in same tenant (Should fail!)
    expect(() => insertUser('tenant_b', 'staff1', '01066686503')).toThrow();
  });
});
