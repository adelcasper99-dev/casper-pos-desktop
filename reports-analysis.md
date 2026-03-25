# تحليل شامل للتقارير - الفجوات والتحسينات

## 📊 الوضع الحالي للتقارير

### الصفحات الحالية للتقارير:

| المسار | الاسم في القائمة | الوظيفة |
|--------|-----------------|---------|
| `/reports` | التقارير المالية | التقارير المالية والمبيعات والمشتريات |
| `/reports/profit-loss` | الأرباح والخسائر | تقرير الأرباح والخسائر P&L |
| `/reports/inventory` | تقرير المخزون | تقرير المخزون ومستويات Stock |
| `/reports/cash-flow` | التدفقات النقدية | تقرير التدفقات النقدية |
| `/dashboard/reports/maintenance-profit` | أرباح الصيانة | تقرير أرباح قسم الصيانة |
| `/logs` | السجلات | سجل العمليات والتحكم |

---

## ✅ ما تم إضافته:

### 1. تقرير الأرباح والخسائر (P&L)
- **المسار**: `/reports/profit-loss`
- **الملف**: `src/actions/reports/profit-loss.ts`
- **الصفحة**: `src/app/(routes)/reports/profit-loss/page.tsx`

**يشمل**:
- إيرادات المبيعات (POS)
- إيرادات الصيانة
- إيرادات أخرى
- تكلفة البضاعة المباعة (COGS)
- تكلفة قطع الغيار للصيانة
- المصروفات التشغيلية
- صافي الربح
- هامش الربح

### 2. تقرير المخزون
- **المسار**: `/reports/inventory`
- **الملف**: `src/actions/reports/inventory.ts`
- **الصفحة**: `src/app/(routes)/reports/inventory/page.tsx`

**يشمل**:
- قائمة جميع الأصناف
- الكمية المتاحة
- القيمة الإجمالية للمخزون
- المخزون المنخفض
- نفاد المخزون
- تصنيف حسب الفئة
- التصدير لـ Excel

### 3. تقرير الموارد البشرية
- **المسار**: (قيد التطوير)
- **الملف**: `src/actions/reports/hr.ts`

**يشمل**:
- عدد الموظفين
- أيام الحضور والانصراف
- الساعات العمل الإجمالية
- الرواتب والمكافآت والخصومات
- نسبة الحضور

---

## 🔄 التقارير المحدثة:

### Sidebar المحدث:
```javascript
{ key: "reports_main", href: "/reports", icon: BarChart3, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
{ key: "reports_profit_loss", href: "/reports/profit-loss", icon: TrendingUp, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
{ key: "reports_inventory", href: "/reports/inventory", icon: Package, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
{ key: "reports_cash_flow", href: "/reports/cash-flow", icon: Landmark, permission: PERMISSION_REGISTRY.REPORTS.VIEW },
```

### الترجمات المضافة:
```json
"reports_main": "التقارير المالية",
"reports_profit_loss": "الأرباح والخسائر",
"reports_inventory": "تقرير المخزون",
"reports_cash_flow": "التدفقات النقدية",
```

---

## 📋 التقارير المطلوبة مستقبلاً:

### تقارير العملاء:
- تقرير حركة المحفظة
- تقرير العملاء الجدد
- تقرير الحدود الائتمانية

### تقارير الموردين:
- أرصدة الموردين
- مشتريات الموردين

### تقارير المحاسبة:
- دفتر الأستاذ
- تقرير المصروفات والإيرادات
- تقرير الضرائب

### تقارير المردودات:
- تقرير المردودات
- أسباب المردودات
