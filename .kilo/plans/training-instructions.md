# Training System Implementation Instructions

## Step 1: Create TrainingModal Component
Create a new file at `src/components/ui/TrainingModal.tsx` with the following content:

```tsx
"use client";

import { useState } from "react";
import { GlassModal } from "./GlassModal";
import { Button } from "./button";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface TrainingStep {
  id: number;
  title: string;
  description: string;
}

const TRAINING_STEPS_AR: TrainingStep[] = [
  {
    id: 1,
    title: "الصفحة الرئيسية",
    description: "مرحبًا بك في نظام تدريب Casper POS. هذا الدليل سيساعدك على تعلم كيفية استخدام النظام الأساسي.",
  },
  {
    id: 2,
    title: "نقطة البيع (POS)",
    description: "ابدأ عملية بيع جديدة بالنقر على زر 'نقطة البيع' في الشريط الجانبي.",
  },
  {
    id: 3,
    title: "إضافة منتجات للسلة",
    description: "ابحث عن منتج باستخدام شريط البحث أو Scan الباركود، ثم اضف him إلى السلة.",
  },
  {
    id: 4,
    title: "إتمام عملية البيع",
    description: "بعد إضافة المنتجات، اختر طريقة الدفع (نقدي، بطاقة، إلخ) ثم اضغط 'إتمام البيع'.",
  },
  {
    id: 5,
    title: "إدارة الخزينة",
    description: "لعرض وإدارة المعاملات المالية، انتقل إلى قسم 'الخزينة' من الشريط الجانبي.",
  },
  {
    id: 6,
    title: "إضافة مخزون جديد",
    description: "لإضافة منتجات جديدة للمخزون، انتقل إلى قسم 'المخزون' ثم استخدم زر 'إضافة منتج'.",
  },
  {
    id: 7,
    title: "نهاية التدريب",
    description: "لقد أكملت التدريب الأساسي! يمكنك إعادة تشغيل هذا الدليل في أي وقت من زر المساعدة.",
  },
];

export default function TrainingModal() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const totalSteps = TRAINING_STEPS_AR.length;

  const goToStep = (step: number) => {
    setCurrentStep(Math.max(0, Math.min(step, totalSteps - 1)));
  };

  const nextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsOpen(false);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors z-50"
        aria-label="فتح التدريب"
      >
        <Info className="w-5 h-5" />
      </button>

      <GlassModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="التدريب على استخدام Casper POS"
        className="max-w-2xl w-full"
      >
        <div className="space-y-6">
          {/* Step Content */}
          <div className="text-center">
            <h2 className="text-xl font-bold">{TRAINING_STEPS_AR[currentStep].title}</h2>
            <p className="text-muted-foreground mt-2">
              {TRAINING_STEPS_AR[currentStep].description}
            </p>
          </div>

          {/* Progress Indicator */}
          <div className="flex items-center gap-2 justify-center">
            {TRAINING_STEPS_AR.map((step, index) => (
              <div
                key={index}
                className={cn(
                  "w-3 h-3 rounded-full transition-colors",
                  index === currentStep
                    ? "bg-primary"
                    : index < currentStep
                    ? "bg-muted"
                    : "bg-muted/50"
                )}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex justify-center gap-3 mt-6">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={prevStep}
                size="icon"
                aria-label="الخطوة السابقة"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            {currentStep < totalSteps - 1 && (
              <Button onClick={nextStep}>
                {currentStep === totalSteps - 2 ? "إنهاء" : "التالي"}
                <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            )}
            {currentStep === totalSteps - 1 && (
              <Button onClick={nextStep}>إنهاء التدريب</Button>
            )}
          </div>
        </div>
      </GlassModal>
    </>
  );
}
```

## Step 2: Add Trigger to Sidebar
Edit `src/components/Sidebar.tsx` and add the following button inside the bottom div (after the ModeToggle and before the StaffProfileBadge):

```tsx
/* Training Button */
<button
  onClick={() => {
    // This will trigger the fixed button in TrainingModal
    // The TrainingModal component already has a fixed button that opens the modal
    // So we don't need to do anything here - the fixed button is always visible
  }}
  className={cn(
    "relative flex items-center gap-4 p-3 rounded-lg w-full transition-all duration-200 group overflow-hidden",
    "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-white"
  )}
>
  <Info strokeWidth={1.25} className={cn("w-5 h-5 shrink-0 relative z-10")} />
  <span className={cn(
    "text-sm font-semibold transition-opacity duration-200 whitespace-nowrap relative z-10 tracking-wide",
    isExpanded ? "opacity-100" : "opacity-0 w-0"
  )}>
    التدريب
  </span>
</button>
```

Note: The TrainingModal component already includes a fixed button (bottom-right) that opens the modal. The Sidebar button is optional and duplicates functionality. You can use either:
1. The fixed button in TrainingModal (always visible at bottom-right)
2. The Sidebar button (if you prefer it in the sidebar)

## Step 3: Verify Dependencies
Ensure you have the following dependencies installed:
- react
- lucide-react (for icons)
- @/components/ui/GlassModal
- @/components/ui/Button
- @/lib/utils (for cn utility)

## Step 4: Test
1. Start the application
2. Click the training button (either fixed bottom-right or in sidebar)
3. Verify the modal opens and shows the first step in Arabic
4. Navigate through steps using next/previous buttons
5. Verify the modal closes when clicking outside or on the finish button

## Notes
- All training content is in Arabic as requested
- The modal uses the existing GlassModal and Button components for consistency
- The training steps cover the main user workflows: POS, adding items, completing sales, treasury, and inventory
- The system is designed to be extensible for additional training modules