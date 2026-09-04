# خطة التنفيذ: ضغط واجهة إدارة المخزون بنمط Taste-Tier المدمج (Single-Viewport)

> **الهدف:** تطبيق نمط الـ **Taste-Tier Single Viewport** على صفحة **إدارة المخزون (`/inventory`)** ومكونات [ClientHelper.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/ClientHelper.tsx) و [ProductsTab.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/inventory/ProductsTab.tsx)، لتحويل الجدول من عرض 3 منتجات فقط إلى عرض 12-16 منتجاً في نفس الشاشة دون سكرول خارجي.

---

## 1. ملخص المشاكل البصرية والتحويل المستهدف

| المكوّن | الوضع الحالي | التحويل المطلوب (Taste-Tier Compact) |
|---|---|---|
| **ترويسة الصفحة ([page.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/page.tsx))** | عنوان `text-3xl` وهوامش ضخمة تستهلك 120px | ترويسة شريطية مدمجة `h-9` مع أيقونة مصغرة وعنوان رشيق `text-base` |
| **شريط التبويبات ([ClientHelper.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/ClientHelper.tsx))** | أشرطة تبويب متعددة بحشو كبير وتباعدات متفرقة | شريطان مدمجان: رئيسي `h-8` وفرعي `h-7` بأزرار رشيقة أنيقة |
| **شريط البحث والفلاتر ([ProductsTab.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/inventory/ProductsTab.tsx))** | حقل بحث ضخم وأزرار فلاتر `h-10` و `h-11` تستهلك 3 صفوف | دمج البحث في حقل `h-8 ps-9` وأزرار الفلاتر بمقاس موحد `h-7.5` |
| **جدول المنتجات والأصناف ([ProductsTab.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/inventory/ProductsTab.tsx))** | حشو خلايا `px-6 py-4` وخط مخزون `text-2xl` (يظهر 3 منتجات فقط) | حشو خلايا `px-3 py-1.5`، مخزون وأسعار `font-mono text-xs font-bold`، ظهور 12 إلى 15 صنفاً |
| **احتواء التمرير (Scroll Boundary)** | سكرول خارجي تضيع معه الترويسة وأدوات البحث | سكرول داخلي `max-h-[calc(100vh-270px)]` مع تثبيت رأس الجدول `sticky top-0 z-20` |

---

## 2. تفاصيل التعديلات البرمجية

### أ. [src/app/(routes)/inventory/page.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/page.tsx)
- تقليص الحاوية الخارجية من `space-y-6 max-w-[2400px]` إلى:
  `space-y-2.5 max-w-[1920px] mx-auto p-3 md:p-4`
- ترويسة الصفحة:
  - استبدال `text-3xl` بشريط ترويسة مدمج:
    ```tsx
    <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs">
            <Box className="w-4 h-4" />
        </div>
        <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                {t('title')}
                <span className="text-[11px] font-normal text-zinc-400">({t('subtitle')})</span>
            </h1>
        </div>
    </div>
    ```

### ب. [src/app/(routes)/inventory/ClientHelper.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/app/(routes)/inventory/ClientHelper.tsx)
- تقليص التباعد الرأسي: `space-y-2`.
- شريط التبويبات الرئيسي (المخزون، المواقع، Reorder Rules، Stock Requests):
  - تحويله لشريط `h-8` مدمج:
    `inline-flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-900/60 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-inner`
  - الأزرار: `h-8 px-3 rounded-lg text-xs font-bold`.
- شريط التبويبات الفرعية (المنتجات، النواقص، الفئات):
  - شريط مدمج: `p-1 bg-zinc-50/80 dark:bg-zinc-900/40 rounded-xl border border-zinc-200/80 dark:border-white/10 shadow-xs flex items-center justify-between gap-2`
  - الأزرار: `h-7 px-3 rounded-lg text-xs font-bold` مع بادج النواقص `h-5 px-1.5 text-[10px]`.

### ج. [src/components/inventory/ProductsTab.tsx](file:///f:/casper%20desktop/casper-pos-desktop/src/components/inventory/ProductsTab.tsx)
1. **شريط البحث والإجراءات:**
   - مدخل البحث: `h-8 ps-9 pe-8 text-xs font-medium rounded-lg bg-white dark:bg-zinc-900/50 border-zinc-200/80 dark:border-white/10`.
   - أزرار الإجراءات ("تحميل النموذج"، "إضافة منتج"، "طباعة الباركود"):
     `h-8 px-3 rounded-lg text-xs font-bold`.
2. **شريط الفلاتر المتقدمة (التواريخ، المستودع، الفئة، الحالة، الترتيب):**
   - تحويل جميع أزرار الـ Dropdown إلى مقاس `h-7.5 px-2.5 text-xs font-bold rounded-lg`.
   - تقليص أزرار فلاتر التاريخ إلى `h-7 px-2 text-[10px]`.
3. **جدول الأصناف فائق الكثافة (Single-Viewport High-Density Grid):**
   - حاوية الجدول:
     `border border-zinc-200/80 dark:border-white/10 rounded-xl overflow-hidden shadow-xs bg-white dark:bg-zinc-950/40 flex flex-col`
   - حاوية السكرول:
     `max-h-[calc(100vh-270px)] overflow-y-auto overflow-x-auto custom-scrollbar`
   - رأس الجدول:
     `sticky top-0 z-20 bg-zinc-100/95 dark:bg-zinc-900/95 backdrop-blur-xs border-b border-zinc-200/80 dark:border-white/10`
   - خلايا رأس الجدول:
     `px-3 py-2 text-[10px] font-black uppercase tracking-wider`
   - أسطر الأصناف:
     - حشو الخلايا: `px-3 py-1.5 whitespace-nowrap text-xs`
     - الكود (SKU): `font-mono text-xs font-bold text-cyan-600 dark:text-cyan-400`
     - اسم المنتج: `text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[200px]`
     - الموديل والقسم: بادجات مصغرة `text-[10px] px-1.5 py-0.5 rounded`
     - المخزون: `text-xs font-mono font-black tabular-nums` (لون أحمر للنواقص)
     - الأسعار والتكلفة: `font-mono font-bold text-xs tabular-nums whitespace-nowrap`
     - أزرار الإجراءات السريعة: أزرار مصغرة `w-6 h-6 rounded-md p-1`
4. **شريط الترقيم (Pagination Bar):**
   - شريط مدمج `p-1.5 px-3 border-t border-zinc-200/80 dark:border-white/10 flex items-center justify-between text-xs` مع أزرار تنقل `h-6 w-6`.

---

## 3. خطة التحقق والاختبار (Verification Plan)
1. **فحص الـ Types الصارم:**
   ```bash
   npx tsc --noEmit
   ```
2. **فحص التوافقية وسيرفر الـ Next.js:**
   - طلب `http://localhost:3001/inventory` للتأكد من الاستجابة الطبيعية.
3. **المعاينة البصرية المباشرة:**
   - ظهور أكثر من 12 منتجاً في شاشة الـ 1080p دفعة واحدة بدون أي تمرير خارجي.
