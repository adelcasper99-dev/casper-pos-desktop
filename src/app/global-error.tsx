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
          <p className="text-slate-400 text-sm mb-4">
            تعذرت معالجة الطلب في الوقت الحالي. تم تسجيل الخطأ لإصلاحه.
          </p>
          {error?.message && (
            <div className="bg-red-950/50 border border-red-900 text-red-300 text-xs font-mono p-3 rounded-lg mb-4 text-left overflow-x-auto max-h-48">
              <p className="font-bold">{error.name}: {error.message}</p>
              {error.digest && <p className="text-slate-500 text-[10px] mt-1">Digest: {error.digest}</p>}
              {error.stack && <pre className="text-[10px] mt-2 whitespace-pre-wrap">{error.stack}</pre>}
            </div>
          )}
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
