"use client";
import { useState } from "react";
import { createSupplier } from "@/actions/inventory";
import GlassModal from "@/components/ui/GlassModal";
import { Save, Loader2 } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";

export default function SupplierModal({ isOpen, onClose }: any) {
    const t = useTranslations('SupplierModal');
    const [loading, setLoading] = useState(false);

    // Assuming 'editingSupplier' and 'updateSupplier' are defined elsewhere or will be added.
    // For this change, we'll adapt the new function signature and logic.
    // The original code used `handleSubmit` with `formData: FormData` directly in `form action`.
    // The new code uses `onSubmit` with `data: any`, implying a client-side handler will prepare `data`.
    // To make the provided snippet syntactically correct and functional with the existing form,
    // we'll keep the `handleSubmit` name and adapt its body to the new logic,
    // assuming `data` will be extracted from `formData` as before,
    // and `editingSupplier`/`updateSupplier` are placeholders for future changes.
    // Since the instruction is to remove csrfToken usage, and the original code doesn't explicitly use it,
    // this change primarily updates the submission logic as per the provided "Code Edit" snippet.

    async function handleSubmit(formData: FormData) {
        setLoading(true);
        const data = Object.fromEntries(formData.entries()); // Extract data from formData
        try {
            // The provided snippet introduces editingSupplier and updateSupplier.
            // As these are not in the original context, we'll keep the createSupplier call
            // but adapt the structure to match the new onSubmit's try/catch/finally.
            // If the intent was to introduce editing, more context would be needed.
            // For now, we'll assume the primary action is still creation,
            // but the error handling and loading state management are updated.
            await createSupplier(data as any);
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <GlassModal isOpen={isOpen} onClose={onClose} title={t('title')}>
            <form action={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">{t('companyName')}</label>
                    <input name="name" type="text" className="w-full glass-input" required />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('phone')}</label>
                        <input name="phone" type="tel" className="w-full glass-input" dir="ltr" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">{t('email')}</label>
                        <input name="email" type="email" className="w-full glass-input" dir="ltr" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1">{t('address')}</label>
                    <textarea name="address" className="w-full glass-input resize-none h-20"></textarea>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-500 border border-cyan-500/50 p-3 rounded-xl flex items-center justify-center gap-2 transition-all font-medium mt-4"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    {loading ? t('saving') : t('save')}
                </button>
            </form>
        </GlassModal>
    );
}
