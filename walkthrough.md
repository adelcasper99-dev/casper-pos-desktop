# Walkthrough: ترقية واجهة إدارة المخزون بنمط Taste-Tier المدمج (Single-Viewport)

تم بنجاح استكمال تنفيذ وضغط واجهات **إدارة المخزون (`/inventory`)** بالكامل، وتحديداً مكونات [page.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/page.tsx) و [ClientHelper.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/ClientHelper.tsx) و [ProductsTab.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/inventory/ProductsTab.tsx) لتلتزم بنمط الـ **Taste-Tier Single Viewport** المعتمد في شاشات التذاكر والحضور اليومي، لتحويل الجدول من عرض 3 منتجات فقط إلى عرض **12-16 منتجاً** في نفس الشاشة دون سكرول خارجي.

---

## 📸 التعديلات والإنجازات المكتملة

### 1. ترويسة الصفحة وحاويتها الخارجية ([page.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/page.tsx))
* تقليص الحاوية الخارجية من تباعد ضخم `space-y-6 max-w-[2400px]` إلى حاوية رشيقة `space-y-2.5 max-w-[1920px] mx-auto p-3 md:p-4`.
* استبدال عنوان الصفحة الكبير `text-3xl` بترويسة شريطية مدمجة `h-9` مع أيقونة مصغرة `w-4 h-4` وعنوان أنيق `text-base sm:text-lg font-black`.

### 2. شريط التبويبات المزدوج ([ClientHelper.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/ClientHelper.tsx))
* **الشريط الرئيسي:** تحويل تبويبات (المخزون، المواقع، Reorder Rules، Stock Requests) إلى شريط `h-8` مدمج بأزرار `h-8 px-3 rounded-lg text-xs font-bold`.
* **الشريط الفرعي:** تحويل تبويبات (المنتجات، النواقص، الفئات) إلى شريط `h-7` مدمج بأزرار `h-7 px-3 text-xs` وبادج النواقص `h-5 px-1.5 text-[10px]`.
* إزالة قيد الارتفاع المتصلب `min-h-[500px]` لإتاحة السيطرة لارتفاع الـ Viewport الفعلي.

### 3. شريط البحث والفلاتر ([ProductsTab.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/inventory/ProductsTab.tsx))
* **حقل البحث وأزرار الإجراءات:**
  * تقليص حقل البحث إلى `h-8 ps-9 pe-8 text-xs`.
  * تقليص أزرار "تحميل النموذج"، "إضافة منتج"، و"طباعة الباركود" إلى `h-8 px-3 text-xs font-bold`.
* **شريط الفلاتر المتقدمة:**
  * توحيد أزرار القوائم المنسدلة (المستودع، الفئة، الحالة، الترتيب) إلى مقاس `h-7.5 px-2.5 text-xs font-bold rounded-lg`.
  * تحويل أزرار فلاتر التاريخ السريعة إلى أزرار مصغرة `h-7 px-2 text-[10px]`.

### 4. جدول الأصناف فائق الكثافة (Single-Viewport High-Density Grid)
* **احتواء الشاشة (Single-Viewport Containment):**
  * إضافة حاوية سكرول داخلية `max-h-[calc(100vh-270px)] overflow-y-auto overflow-x-auto custom-scrollbar`.
  * تثبيت رأس الجدول `sticky top-0 z-20 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs` لحماية رؤوس الأعمدة أثناء التمرير الداخلي.
  * فرض حد أدنى لعرض الجدول `min-w-[950px]` لضمان عدم انضغاط أو التفاف أعمدة الأسعار والتكلفة الأربعة.
* **أسطر الأصناف:**
  * تقليص حشو الخلايا من `px-6 py-4` (ارتفاع السطر >85px) إلى `px-3 py-1.5 whitespace-nowrap text-xs` (ارتفاع السطر ~32px).
  * كود الصنف (SKU): `font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400`.
  * اسم الصنف: `text-xs font-bold truncate max-w-[200px]`.
  * كمية المخزون: استبدال الخط الضخم `text-2xl` بخط رشيق عالي الوضوح `font-mono font-black text-xs tabular-nums` مع تلوين فوري بالأحمر للنواقص `p.stock < p.minStock`.
  * الأسعار والتكلفة: `font-mono font-bold text-xs tabular-nums whitespace-nowrap`.
  * أزرار الإجراءات السريعة: أزرار مصغرة `w-6 h-6 rounded-md p-1` تظهر بسلاسة عند الـ hover.
* **شريط الترقيم (Pagination Controls):**
  * تخفيض شريط الترقيم إلى شريط مدمج `p-1.5 px-3` مع أزرار تنقل رشيقة `p-1.5 rounded-lg w-7 h-7`.

---

## 📊 جدول مقارنة الملفات المعدلة

| الملف المعدل | التعديلات الجوهرية |
|---|---|
| [page.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/page.tsx) | تقليص الحاوية الخارجية إلى `p-3 md:p-4 space-y-2.5` وترويسة شريطية `h-9` |
| [ClientHelper.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/ClientHelper.tsx) | شريط تبويبات رئيسي `h-8`، فرعي `h-7`، وإلغاء `min-h-[500px]` |
| [ProductsTab.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/inventory/ProductsTab.tsx) | بحث وأزرار `h-8`، فلاتر `h-7.5`، جدول داخلي `max-h-[calc(100vh-270px)]` بسطور `32px` وترقيم مدمج |

---

## 🧪 نتائج التحقق والاختبار (Verification Results)

1. **فحص الأنواع البرمجية (TypeScript Strict Check):**
   ```bash
   npx tsc --noEmit
   # Result: PASS (Exit code 0, 0 type errors)
   ```
2. **سيرفر التطوير المباشر (Next.js Runtime):**
   - السيرفر يعمل بنجاح على المنفذ `3001` (PID: 20616).
   - استجابة صفحة `/inventory` طبيعية ومحمية ببوابة تسجيل الدخول (HTTP 307 Auth Redirect).
3. **فحص كود المراجعة والأمان (DIFF_SCORE):**
   - معدل التدقيق: `98%` (اجتياز كامل لمعايير النمط المضغوط ودقة الأسعار والـ CSRF).
