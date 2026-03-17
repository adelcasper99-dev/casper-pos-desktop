'use client'

import { formatCurrency } from "@/lib/utils";

interface EngineerStockPrintTemplateProps {
    engineer: any;
    stock: any[];
    settings: any;
    translations: any;
}

export default function EngineerStockPrintTemplate({ engineer, stock, settings, translations }: EngineerStockPrintTemplateProps) {
    const t = translations;
    const now = new Date();

    return (
        <div className="p-8 bg-white text-black font-sans" style={{ direction: 'rtl' }}>
            {/* Header */}
            <div className="text-center border-b-2 border-black pb-4 mb-6">
                {settings?.logoUrl && (
                    <img src={settings.logoUrl} alt="Logo" className="h-16 mx-auto mb-2" />
                )}
                <h1 className="text-2xl font-bold uppercase">{settings?.name || "Casper ERP"}</h1>
                <p className="text-sm">{settings?.address}</p>
                <div className="mt-4 inline-block border border-black px-4 py-1 text-lg font-bold">
                    {t('details.stockReport') || "تقرير جرد العهدة"}
                </div>
            </div>

            {/* Engineer Info */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <div>
                    <span className="font-bold">{t('form.name')}: </span>
                    <span>{engineer.name}</span>
                </div>
                <div className="text-left">
                    <span className="font-bold">{t('table.date')}: </span>
                    <span dir="ltr">{now.toLocaleString('ar-EG')}</span>
                </div>
                <div>
                    <span className="font-bold">{t('form.phone')}: </span>
                    <span dir="ltr">{engineer.phone}</span>
                </div>
                <div className="text-left">
                    <span className="font-bold">{t('form.branch')}: </span>
                    <span>{engineer.warehouse?.name || '-'}</span>
                </div>
            </div>

            {/* Stock Table */}
            <table className="w-full border-collapse border border-black text-sm">
                <thead>
                    <tr className="bg-gray-100">
                        <th className="border border-black p-2 text-right">{t('details.product')}</th>
                        <th className="border border-black p-2 text-center">{t('details.qty')}</th>
                        <th className="border border-black p-2 text-left">{t('details.value')}</th>
                    </tr>
                </thead>
                <tbody>
                    {stock.map((item, idx) => (
                        <tr key={idx}>
                            <td className="border border-black p-2">{item.product.name}</td>
                            <td className="border border-black p-2 text-center">{item.quantity}</td>
                            <td className="border border-black p-2 text-left" dir="ltr">
                                {formatCurrency(Number(item.product.sellPrice) * item.quantity)}
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="font-bold bg-gray-50">
                        <td className="border border-black p-2 text-right" colSpan={2}>
                            {t('details.totalValue') || "إجمالي قيمة العهدة"}
                        </td>
                        <td className="border border-black p-2 text-left" dir="ltr">
                            {formatCurrency(stock.reduce((sum, item) => sum + (Number(item.product.sellPrice) * item.quantity), 0))}
                        </td>
                    </tr>
                </tfoot>
            </table>

            {/* Signatures */}
            <div className="mt-12 grid grid-cols-2 gap-20 text-center text-sm">
                <div>
                    <div className="border-t border-black pt-2 font-bold">توقيع المستلم (المهندس)</div>
                </div>
                <div>
                    <div className="border-t border-black pt-2 font-bold">توقيع المسؤول (المخزن)</div>
                </div>
            </div>

            <div className="mt-8 text-[10px] text-gray-400 text-center">
                تم استخراج هذا التقرير آلياً بواسطة نظام Casper ERP
            </div>
        </div>
    );
}
