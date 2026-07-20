'use client';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 dir-rtl text-center">
            <h2 className="text-2xl font-bold text-red-500 mb-2">حدث خطأ في النظام (500)</h2>
            <p className="text-slate-400 text-sm mb-6">يرجى المحاولة مرة أخرى أو التواصل مع الدعم الفني.</p>
            <button
                onClick={() => reset()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
            >
                إعادة المحاولة
            </button>
        </div>
    );
}
