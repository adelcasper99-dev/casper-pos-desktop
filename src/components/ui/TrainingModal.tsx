"use client";

import { useState } from "react";
import GlassModal from "./GlassModal";
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
    title: "الصفحة الرئيسية - لوحة التحكم",
    description: "مرحبًا بك في نظام Casper POS! هذه اللوحة تعرض إحصائيات المبيعات اليومية، الأرباح، وعدد المعاملات. يمكنك الوصول السريع لجميع الأقسام من الشريط الجانبي الأيسر.",
  },
  {
    id: 2,
    title: "نقطة البيع (POS)",
    description: "انقر على 'نقطة البيع' في الشريط الجانبي لبدء عملية بيع جديدة. ستظهر لك واجهة تتضمن: شريط البحث عن المنتجات، قائمة الفئات، والسلة على اليمين.",
  },
  {
    id: 3,
    title: "إضافة منتجات للسلة",
    description: "لإضافة منتج: اكتب اسمه في شريط البحث أو امسح الباركود ضوئيًا، ثم انقر على المنتج لإضافته للسلة. يمكنك تغيير الكمية باستخدام أزرار +/- أو كتابة الكمية مباشرة.",
  },
  {
    id: 4,
    title: "طرق الدفع وإتمام البيع",
    description: "بعد إضافة المنتجات للسلة، اختر طريقة الدفع (نقدي، بطاقة خصم، آجل). ثم انقر زر 'إتمام البيع' لطباعة الفاتورة وإتمام المعاملة.",
  },
  {
    id: 5,
    title: "إدارة المخزون",
    description: "انتقل لقسم 'المخزون' لإضافة منتجات جديدة أو تحديث الكميات. يمكنك: إضافة منتج جديد، تعديل الأسعار، فحص المخزون، وتسجيل الهالك.",
  },
  {
    id: 6,
    title: "إدارة الخزينة",
    description: "قسم 'الخزينة' يعرض المعاملات المالية: الإيداعات، السحوبات، والمصروفات. يمكنك تسجيل عمليات الإيداع والسحب وإدارة أرصدة الصناديق.",
  },
  {
    id: 7,
    title: "العملاء والحسابات",
    description: "قسم 'العملاء' يتيح لك: إضافة عملاء جدد، تسجيل عمليات البيع بالآجل، ومتابعة الذمم المدينة. اختر العميل قبل البيع ليتم تحميل المبلغ على حسابه.",
  },
  {
    id: 8,
    title: "المشتريات والموردين",
    description: "انتقل لقسم 'المشتريات' لتسجيل أوامر الشراء من الموردين. أدخل تفاصيل الفاتورة وأضف المنتجات للمخزون مع تحديد التكاليف.",
  },
  {
    id: 9,
    title: "التقارير والتحليلات",
    description: "قسم 'التقارير' يوفر تقارير مفصلة عن: المبيعات، الأرباح، المخزون، وتدفق النقد. اختر الفترة الزمنية المطلوبة واعرض أو اطبع التقرير.",
  },
  {
    id: 10,
    title: "إدارة الموظفين",
    description: "قسم 'الموارد البشرية' يتيح: تسجيل الحضور والانصراف، إدارة الرواتب، ومتابعة أداء الموظفين. يمكن تتبع الحضور يوميًا.",
  },
  {
    id: 11,
    title: "الصيانة والتذاكر",
    description: "أنشئ تذاكر صيانة للأجهزة، عيّن الفني، وتتبع حالة الإصلاح حتى الاكتمال. يمكنك إدارة جميع طلبات الصيانة من هذا القسم.",
  },
  {
    id: 12,
    title: "الإعدادات",
    description: "قسم 'الإعدادات' (للمديرين فقط) يتيح: إعدادات المتجر، إدارة المستخدمين والصلاحيات، إعدادات الطابعات، وتنبيهات النظام.",
  },
  {
    id: 13,
    title: "نهاية التدريب - مبروك!",
    description: "لقد أكملت التدريب الأساسي! الآن يمكنك: البيع، إدارة المخزون، متابعة الخزينة، وتقارير الأعمال. انقر 'إعادة التدريب' في أي وقت من زر المساعدة.",
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
      // Reset to beginning for restart
      setCurrentStep(0);
      setIsOpen(false);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const restartTraining = () => {
    setCurrentStep(0);
    setIsOpen(true);
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
              <div className="flex gap-2">
                <Button variant="outline" onClick={restartTraining}>
                  إعادة التدريب
                </Button>
                <Button onClick={nextStep}>
                  إغلاق
                </Button>
              </div>
            )}
          </div>
        </div>
      </GlassModal>
    </>
  );
}