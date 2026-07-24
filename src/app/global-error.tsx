"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-slate-950 text-white font-sans flex flex-col items-center justify-center min-h-screen p-6">
        <div className="text-center max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl">
          <h1 className="text-3xl font-black text-red-500 mb-4">500 - حدث خطأ غير متوقع</h1>
          <p className="text-slate-400 text-sm mb-6">
            تعذرت معالجة الطلب في الوقت الحالي. تم تسجيل الخطأ لإصلاحه.
          </p>
          <button
            onClick={() => reset()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl transition-all"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
