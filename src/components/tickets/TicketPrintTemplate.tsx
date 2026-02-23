import { formatCurrency } from "@/lib/utils";
import Barcode from "react-barcode";
import { Ticket, ReceiptSettings } from "@/types/tickets";

interface TicketPrintTemplateProps {
    ticket: Ticket;
    settings: ReceiptSettings;
    translations?: any;
}

export default function TicketPrintTemplate({ ticket, settings, translations }: TicketPrintTemplateProps) {
    if (!ticket || !settings) return null;

    const t = translations || {};

    return (
        // Root: direction rtl — the browser's built-in bidi engine handles all Arabic naturally.
        // No manual text reversal needed. Numbers/dates inside use dir="ltr" to stay LTR.
        <div className="p-4 font-mono text-sm bg-transparent text-black h-auto" style={{ direction: 'rtl' }}>

            {/* ── Header ── (center is direction-agnostic) */}
            <div className="header text-center border-b-2 border-dashed border-black/80 pb-4 mb-4">
                {settings?.logoUrl && settings.logoUrl !== "undefined" && (
                    <div className="relative w-20 h-20 mx-auto mb-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={settings.logoUrl}
                            alt="Logo"
                            className="logo opacity-100 grayscale-0 object-contain w-20 h-20 mx-auto block"
                        />
                    </div>
                )}
                {settings.printHeader && (
                    <div className="text-xs font-bold mb-2 whitespace-pre-wrap">{settings.printHeader}</div>
                )}
                <h3 className="text-xl font-black tracking-widest uppercase">{settings.name}</h3>
                {settings.address && (
                    <p className="text-xs font-bold mt-1">{settings.address}</p>
                )}
                {/* Ticket number badge — always LTR */}
                <div className="mt-4 border-2 border-black p-2 inline-block rounded font-black text-xl" dir="ltr">
                    #{ticket.barcode}
                </div>
                {/* Date string — always LTR */}
                <p className="text-xs mt-2 text-zinc-600" dir="ltr">
                    {new Date(ticket.createdAt).toLocaleString('en-GB')}
                </p>
            </div>

            {/* ── Customer ── */}
            <div className="mb-4">
                <div className="text-xs font-bold border-b border-black mb-1">{t.customerHeader || "معلومات العميل"}</div>
                <div className="flex justify-between items-center">
                    <span>{t.name || "الاسم"}</span>
                    <span className="font-bold">{ticket.customerName}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span>{t.phone || "الهاتف"}</span>
                    {/* Phone number is always LTR digits */}
                    <span className="font-bold" dir="ltr">{ticket.customerPhone}</span>
                </div>
            </div>

            {/* ── Device ── */}
            <div className="mb-4">
                <div className="text-xs font-bold border-b border-black mb-1">{t.deviceHeader || "تفاصيل الجهاز"}</div>
                <div className="flex justify-between items-center">
                    <span>{t.device || "الجهاز"}</span>
                    <span className="font-bold">{`${ticket.deviceBrand} ${ticket.deviceModel}`}</span>
                </div>
                {ticket.deviceImei && (
                    <div className="flex justify-between items-center">
                        <span>IMEI</span>
                        {/* IMEI is always LTR digits */}
                        <span className="font-bold" dir="ltr">{ticket.deviceImei}</span>
                    </div>
                )}
                <div className="flex justify-between items-center">
                    <span>{t.detail || "اللون"}</span>
                    <span className="font-bold">{ticket.deviceColor || '-'}</span>
                </div>

                {/* Condition */}
                {ticket.conditionNotes && (
                    <div className="flex justify-between items-center mt-1">
                        <span>{t.conditionHeader || "الحالة"}</span>
                        <span className="font-bold">{ticket.conditionNotes}</span>
                    </div>
                )}

                {/* Expected Time */}
                {ticket.expectedDuration ? (
                    <div className="flex justify-between items-center mt-1 pt-1 border-t border-dotted border-black/30">
                        <span>{t.expectedTime || "الوقت المتوقع"}</span>
                        <span className="font-bold text-cyan-900">
                            {Number(ticket.expectedDuration) >= 60
                                ? `${(Number(ticket.expectedDuration) / 60).toFixed(1)} ساعة`
                                : `${ticket.expectedDuration} دقيقة`
                            }
                        </span>
                    </div>
                ) : null}
            </div>

            {/* ── Issue ── */}
            <div className="mb-4">
                <div className="text-xs font-bold border-b border-black mb-1">{t.issueHeader || "المشكلة"}</div>
                <div className="p-1 text-sm">
                    {ticket.issueDescription}
                </div>
            </div>

            {/* ── Financial Details ── */}
            {(ticket.repairPrice > 0 || ticket.amountPaid > 0) && (
                <div className="mb-4">
                    <div className="text-xs font-bold border-b border-black mb-1">
                        {t.financialHeader || "التفاصيل المالية"}
                    </div>

                    {/* Total */}
                    <div className="flex justify-between items-center text-sm mb-1">
                        <span>{t.repairCost || "الإجمالي"}</span>
                        {/* Currency value stays LTR for readability */}
                        <span className="font-bold" dir="ltr">{formatCurrency(ticket.repairPrice, settings.currency)}</span>
                    </div>

                    {/* Paid */}
                    <div className="flex justify-between items-center text-sm mb-1">
                        <span>{t.paid || "المدفوع"}</span>
                        <span className={`font-bold`} dir="ltr">
                            {formatCurrency(ticket.amountPaid || 0, settings.currency)}
                        </span>
                    </div>

                    {/* Due */}
                    <div className="flex justify-between items-center text-base font-black border-t border-black/20 mt-1 pt-1">
                        <span>{t.due || "المتبقي"}</span>
                        <span dir="ltr">
                            {formatCurrency(Math.max(0, (ticket.repairPrice || 0) - (ticket.amountPaid || 0)), settings.currency)}
                        </span>
                    </div>
                </div>
            )}

            {/* ── Agreement / Terms ── */}
            {t.termsHeader && (
                <div className="mt-6 text-xs leading-tight border-t border-black pt-2 text-center">
                    <p className="mb-2 font-bold text-center">{t.termsHeader}</p>
                    <p>
                        {t.terms1 || ""}
                        <br />
                        {t.terms2 || ""}
                        <br />
                        {t.terms3 || ""}
                    </p>
                </div>
            )}

            {/* ── Footer ── */}
            <div className="footer text-center text-xs font-bold text-black mt-6 space-y-1 whitespace-pre-wrap">
                {settings.receiptFooter || "شكراً لكم"}
            </div>

            {/* ── Barcode ── (always LTR, centered) */}
            <div className="text-center mt-6 flex flex-col items-center justify-center overflow-hidden" dir="ltr">
                <Barcode
                    value={ticket.barcode || ticket.id.substring(0, 8)}
                    width={1.5}
                    height={40}
                    fontSize={14}
                    margin={0}
                    displayValue={true}
                    renderer="svg"
                />
            </div>
        </div>
    );
}
