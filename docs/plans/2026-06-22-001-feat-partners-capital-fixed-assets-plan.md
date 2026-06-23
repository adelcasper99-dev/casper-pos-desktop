# feat: Partners Capital Module + Fixed Assets Opening Balance

## نبذة المشكلة

النظام الحالي يتعامل مع "مالك واحد" (GL 3000) ولا يدعم:
1. **الأصول الثابتة** (معدات / أثاث / سيارات / إهلاك) في الأرصدة الافتتاحية
2. **حسابات الشركاء** المنفصلة بنسب أرباح محددة
3. **توزيع الأرباح والخسائر** بقيد محاسبي حقيقي
4. **الميزانية العمومية** كتقرير مستقل

---

## User Review Required

> [!IMPORTANT]
> قبل البدء، ارجع لتأكيد هذه النقطة:
>
> **توزيع الأرباح**: هل يكون يدوياً عند الطلب (on-demand)، أم دورياً (شهري/سنوي)؟
> القرار الافتراضي في هذه الخطة: **يدوي (on-demand)** — المستخدم يختار الفترة ثم يضغط "توزيع".

> [!WARNING]
> **Migration غير قابلة للتراجع:** سيتم إضافة جدولين جديدين (`Partner` و `PartnerTransaction`) إلى قاعدة البيانات. الـ migration آمنة (additive-only) ولا تحذف أي بيانات موجودة.

---

## Open Questions (Deferred to Implementation)

- هل يتم تسجيل مسحوبات الشريك من الخزينة مباشرة (مثل Transaction) أم من حساب خارج الخزينة؟
  - **الافتراض:** من الخزينة — يتحدث balance الخزينة تلقائياً.
- هل الشريك يمكن أن يكون بنسبة 0% (شريك نائم)؟
  - **الافتراض:** نعم، بشرط أن مجموع النسب = 100%.

---

## الخطة التقنية العالية المستوى

```
المرحلة 1 (بدون Migration):
  ├─ توسيع Opening Balance Wizard [UI + Action فقط]
  └─ إضافة GL codes جديدة للأصول الثابتة في constants.ts

المرحلة 2 (مع Migration):
  ├─ Partner model + PartnerTransaction model في schema.prisma
  ├─ Migration + seedAccounts للحسابات الجديدة
  ├─ Server Actions للشركاء (CRUD + Transactions + Distribution)
  └─ UI Pages (Partner Dashboard + Distribution Wizard)

المرحلة 3 (تقارير):
  └─ Balance Sheet page (/reports/balance-sheet)
```

---

## Proposed Changes

---

### المرحلة 1 — توسيع Opening Balance Wizard (بدون Migration)

#### [MODIFY] `src/shared/constants/accounting-mappings.ts`

إضافة حسابات GL للأصول الثابتة:
```
GL.ASSETS.FIXED_ASSETS      = '1300'  // معدات وأثاث (موجود كـ TECH_CUSTODY — يجب إعادة التسمية)
GL.ASSETS.VEHICLES          = '1310'  // وسائل نقل (جديد)
GL.ASSETS.ACCUM_DEPRECIATION = '1320' // إهلاك متراكم (جديد - عكسي)
```

> [!CAUTION]
> `GL.ASSETS.TECH_CUSTODY = '1300'` يستخدم نفس الكود `1300` لحسابات الفنيين.
> **الحل:** نضيف `1305` للأصول الثابتة المحاسبية بدلاً من الكتابة فوق `1300`.
> سنستخدم: `FIXED_ASSETS = '1305'`, `VEHICLES = '1310'`, `ACCUM_DEPRECIATION = '1315'`

#### [MODIFY] `src/lib/accounting/constants.ts`

إضافة الحسابات الجديدة لـ `DEFAULT_ACCOUNTS`:
```ts
{ code: '1305', name: 'Fixed Assets (Equip. & Furniture)', type: ASSET, isSystem: true },
{ code: '1310', name: 'Vehicles & Transport Assets',       type: ASSET, isSystem: true },
{ code: '1315', name: 'Accumulated Depreciation',          type: ASSET, isSystem: true },
// (contra-asset — credit balance reduces 1305/1310)
```

#### [MODIFY] `src/actions/accounting-setup.ts`

توسيع `setOpeningBalances()` لقبول الحقول الجديدة:
```ts
data: {
  cash, bank, inventory, receivables, payables,
  fixedAssets?: number,   // معدات وأثاث
  vehicles?: number,      // سيارات ووسائل نقل
  depreciation?: number,  // إهلاك متراكم (يُخصم من الأصول)
  equity: number,         // محسوب تلقائياً في الـ UI
}
```

تأثير المعادلة:
```
equity = (cash + bank + inventory + receivables + fixedAssets + vehicles - depreciation) - payables
```

#### [MODIFY] `src/components/setup/OpeningBalanceWizard.tsx`

إضافة قسم "الأصول الثابتة" بين قسم الأصول المتداولة والالتزامات:
- حقل: معدات وآلات (→ 1305)
- حقل: أثاث وديكور (→ 1305، نفس الحساب)
- حقل: وسائل نقل (→ 1310)
- حقل: إهلاك متراكم (→ 1315، يُخصم)
- إعادة حساب `equity` تلقائياً تشمل الحقول الجديدة

**Pattern to follow:** نفس الـ useEffect الموجود في السطور 50-67.

---

### المرحلة 2 — Partner Module

#### [MODIFY] `prisma/schema.prisma`

**نموذج Partner:**
```prisma
model Partner {
  id              String               @id @default(uuid())
  name            String
  phone           String?
  sharePercent    Decimal              // 0.00 → 100.00
  capitalGlCode   String               // e.g. '3001', '3002'
  currentGlCode   String               // e.g. '3201', '3202'
  isActive        Boolean              @default(true)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  transactions    PartnerTransaction[]
}
```

**نموذج PartnerTransaction:**
```prisma
model PartnerTransaction {
  id             String    @id @default(uuid())
  partnerId      String
  type           String    // 'DEPOSIT' | 'DRAWING' | 'DISTRIBUTION'
  amount         Decimal
  description    String?
  treasuryId     String?
  periodFrom     DateTime? // لتوزيع الأرباح
  periodTo       DateTime? // لتوزيع الأرباح
  idempotencyKey String?   @unique
  createdAt      DateTime  @default(now())
  partner        Partner   @relation(fields: [partnerId], references: [id])
  treasury       Treasury? @relation(fields: [treasuryId], references: [id])
}
```

**إضافة relation لـ JournalEntry:**
```prisma
model JournalEntry {
  // ... الحقول الموجودة
  partnerTransactionId String?           @unique
  partnerTransaction   PartnerTransaction? @relation(...)
}
```

**Migration name:** `add_partner_module`

---

#### [NEW] `src/actions/partners.ts`

Server Actions مكتملة:

1. **`getPartners()`** — قائمة الشركاء مع أرصدة حساباتهم
2. **`createPartner(data)`** — إنشاء شريك + auto-seed GL accounts
   - Guard: `validateShareSum()` — مجموع كل النسب بعد الإضافة ≤ 100%
   - auto-assigns `capitalGlCode = '300' + sequence` و `currentGlCode = '320' + sequence`
3. **`updatePartner(id, data)`** — تعديل مع إعادة validation النسب
4. **`deletePartner(id)`** — guard: لا يُحذف إذا كان رصيده > 0
5. **`recordPartnerDeposit(data)`** — إيداع رأس مال
   - `prisma.$transaction([create PartnerTransaction, update Treasury, AccountingEngine.recordTransaction])`
   - Lines: `DEBIT: 1000/1010 (Cash/Bank), CREDIT: partner.capitalGlCode`
6. **`recordPartnerDrawing(data)`** — مسحوبات
   - Lines: `DEBIT: partner.currentGlCode, CREDIT: 1000/1010`
7. **`distributeProfit(periodFrom, periodTo)`** — توزيع الأرباح
   - Guard: لا يوجد توزيع سابق يتداخل مع نفس الفترة (unique idempotencyKey بالفترة)
   - خطوات: `getNetProfit(from, to)` → preview → confirm → close P&L → distribute

---

#### [NEW] `src/app/(routes)/accounting/partners/page.tsx`

صفحة Partner Dashboard:

**Layout:** 3 أقسام:
1. **KPI Row:** إجمالي رأس المال | إجمالي المسحوبات | آخر توزيع أرباح
2. **Partners Table:** الاسم | النسبة | رصيد رأس المال | الحساب الجاري | الإجراءات
3. **Transaction History:** آخر 20 حركة مع الفلترة

**Actions per row:** إيداع / سحب / عرض الحركات

---

#### [NEW] `src/app/(routes)/accounting/partners/distribute/page.tsx`

Profit Distribution Wizard (3 خطوات):

**Step 1 — اختيار الفترة:**
- FlatpickrRangePicker للفترة
- عرض: `صافي الربح المقدر: X,XXX ج.م`
- Guard: إذا خسارة → تحذير حمراء ولكن لا يمنع المتابعة

**Step 2 — Preview (read-only):**
```
| شريك | النسبة | المبلغ المستحق |
| أحمد |  60%   |   12,000 ج.م  |
| محمد |  40%   |    8,000 ج.م  |
| إجمالي | 100% |   20,000 ج.م  |
```

**Step 3 — تأكيد:**
- زر تأكيد واضح مع ملاحظة "لا يمكن التراجع عن هذا القيد"
- بعد النجاح: redirect لصفحة الشركاء مع toast success

---

#### [MODIFY] `src/app/(routes)/accounting/page.tsx` أو nav

إضافة "الشركاء" كـ tab أو link في القسم المحاسبي.

---

### المرحلة 3 — Balance Sheet Page

#### [NEW] `src/actions/reports/balance-sheet.ts`

`getBalanceSheet()` تُجمّع أرصدة الحسابات من `JournalLine` مجمعة حسب `account.type`:

```
ASSETS       → مجموع الـ debits ناقص credits لكل حساب أصول
LIABILITIES  → مجموع الـ credits ناقص debits لكل حساب التزامات
EQUITY       → مجموع الـ credits ناقص debits (رأس مال + أرباح محتجزة + حسابات شركاء)
```

Guard: `|ASSETS - (LIABILITIES + EQUITY)| < 0.01` → إذا غير متوازن، يُسجّل warning في الـ console.

#### [NEW] `src/app/(routes)/reports/balance-sheet/page.tsx`

تقرير الميزانية العمومية بتاريخ محدد:

```
الميزانية العمومية كما في: [DATE PICKER]

┌────────────────────┬────────────────────┐
│ الأصول             │ الالتزامات + حقوق  │
├────────────────────┼────────────────────┤
│ أصول متداولة       │ التزامات قصيرة     │
│   نقدية    X,XXX  │   موردون   X,XXX  │
│   بنك      X,XXX  │   رواتب    X,XXX  │
│   مخزون    X,XXX  │                    │
│   مستحقات  X,XXX  │ حقوق الملكية       │
│                    │   شريك أ   X,XXX  │
│ أصول ثابتة         │   شريك ب   X,XXX  │
│   معدات    X,XXX  │   أرباح    X,XXX  │
│  (إهلاك)  (X,XXX) │                    │
├────────────────────┼────────────────────┤
│ إجمالي   XX,XXX   │ إجمالي   XX,XXX   │
└────────────────────┴────────────────────┘
```

---

## Verification Plan

### Automated Tests

```bash
# Unit test for getNetProfit utility
npx vitest run src/__tests__/net-profit.test.ts

# Check Prisma migration is valid
npx prisma migrate dev --name add_partner_module --create-only

# TypeScript check
npx tsc --noEmit
```

### Test Scenarios

| السيناريو | المتوقع |
|---|---|
| إضافة شريك — نسبة 60% | ✅ يُنشئ GL accounts 3001 و 3201 |
| إضافة شريك ثانٍ — نسبة 50% (مجموع 110%) | ❌ يرفض: "نسب الشركاء تتجاوز 100%" |
| إيداع 10,000 ج.م للشريك أ | ✅ Treasury يزيد + JournalEntry: Dr 1000 / Cr 3001 |
| مسحوبات 5,000 ج.م | ✅ Treasury ينقص + JournalEntry: Dr 3201 / Cr 1000 |
| توزيع أرباح 20,000 ج.م (60/40) | ✅ Dr 3300 20,000 / Cr 3201 12,000 / Cr 3202 8,000 |
| توزيع أرباح مرة ثانية بنفس الفترة | ❌ يرفض بـ idempotencyKey |
| خسارة صافية (netProfit < 0) | ⚠️ تحذير في الـ UI ولكن يسمح بالتوزيع |
| حذف شريك برصيد > 0 | ❌ يرفض: "يوجد رصيد في حساب الشريك" |
| Balance Sheet: الأصول = الالتزامات + حقوق الملكية | ✅ الفارق < 0.01 ج.م |

### Manual Verification

1. فتح `/accounting/partners` → إضافة شريكين (60% + 40%)
2. إيداع رأس مال لكل شريك → التحقق من الخزينة + القيود
3. فتح `/reports/profit-loss` لفترة معينة → تسجيل الـ netProfit
4. فتح `/accounting/partners/distribute` → اختيار نفس الفترة → تأكيد التوزيع
5. فتح `/reports/balance-sheet` → التحقق أن حقوق الملكية تشمل حسابات الشركاء
6. التحقق من `مزامنة دليل الحسابات` في `/settings/accounting` تُنشئ الحسابات الجديدة

---

## تسلسل التنفيذ (Sequencing)

```
1. constants.ts   → إضافة GL codes جديدة
2. seed-accounts  → تشغيل مزامنة دليل الحسابات
3. Wizard UI/Action (Phase 1) ← بدون migration، آمن للنشر
4. schema.prisma  → إضافة Partner + PartnerTransaction
5. prisma migrate dev
6. partners.ts actions
7. partners page UI
8. distribution wizard UI
9. balance-sheet action + page
```
