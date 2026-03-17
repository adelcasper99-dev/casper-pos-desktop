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
    const paperSize = settings.paperSize || "80mm";
    const paperWidth = paperSize === "58mm" ? "48mm" : "74mm";

    return (
        <div 
            className="ticket-print-root font-sans text-black bg-white" 
            style={{ 
                direction: 'rtl', 
                width: '100%', 
                maxWidth: paperWidth, 
                margin: '0 auto 0 4mm',
                padding: '1mm',
                fontSize: paperSize === '58mm' ? '10px' : '12px',
                fontWeight: 900
            }}
        >
            {/* ── Header ── */}
            <div className="header text-center border-b-2 border-black mb-4 pb-2 flex flex-col items-center">
                {settings?.logoUrl && settings.logoUrl !== "undefined" && (
                    <div className="mb-2">
                        <img
                            src={settings.logoUrl}
                            alt="Logo"
                            className="w-16 h-16 object-contain grayscale"
                        />
                    </div>
                )}
                
                {settings.printHeader && (
                    <div className="text-[10px] font-bold mb-1 whitespace-pre-wrap leading-tight">{settings.printHeader}</div>
                )}
                
                <h3 className="text-lg font-black tracking-tighter uppercase leading-none mb-1">{settings.name}</h3>
                
                <div className="flex flex-col items-center justify-center text-[10px] font-black gap-0.5 w-full text-center">
                    {settings.address && (
                        <span className="w-full text-center">📍 {settings.address}</span>
                    )}
                    {settings.phone && (
                        <div className="w-full flex justify-center items-center gap-1 whitespace-nowrap">
                            <span>📞</span>
                            <span>{settings.phone}</span>
                        </div>
                    )}
                </div>

                {/* Ticket ID Badge */}
                <div className="mt-3 border-2 border-black px-4 py-1.5 inline-block rounded-sm font-black text-2xl bg-black text-white" dir="ltr">
                    #{ticket.barcode}
                </div>
                
                <p className="text-[10px] mt-1 font-bold" dir="ltr">
                    {new Date(ticket.createdAt).toLocaleString('ar-EG', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    })}
                </p>
            </div>

            {/* ── Customer Info ── */}
            <div className="section mb-3 border-b border-black pb-1 flex flex-col items-center">
                <div className="w-full flex justify-between items-center font-black text-[10px] uppercase mb-1 opacity-70">
                    <span>{t.customerInfo || "العميل"}</span>
                </div>
                <div className="font-black text-base">{ticket.customerName}</div>
                <div className="font-black text-sm" dir="ltr">{ticket.customerPhone}</div>
            </div>

            {/* ── Device Details ── */}
            <div className="section mb-3 border-b border-black pb-1">
                <div className="flex justify-between items-center font-black text-xs uppercase mb-1">
                    <span>{t.deviceDetails || "الجهاز"}</span>
                </div>
                <div className="flex justify-between items-start">
                    <span className="font-black text-sm">{`${ticket.deviceBrand} ${ticket.deviceModel}`}</span>
                    <span className="bg-black text-white px-1 text-[10px] font-bold">{ticket.deviceColor || '-'}</span>
                </div>
                {ticket.deviceImei && (
                    <div className="text-[10px] font-bold mt-0.5" dir="ltr">IMEI: {ticket.deviceImei}</div>
                )}

                {/* Security Info */}
                {(ticket.securityCode || ticket.patternData) && (
                    <div className="mt-1 p-1 border border-black/20 bg-zinc-50 rounded-sm">
                        {ticket.securityCode && (
                            <div className="flex flex-col items-center justify-center text-[10px] w-full text-center">
                                <span>{t.security || "رمز القفل"}:</span>
                                <span className="font-black text-lg w-full text-center" dir="ltr">{ticket.securityCode}</span>
                            </div>
                        )}
                        {ticket.patternData && (
                            <div className="flex flex-col text-[10px] mt-0.5">
                                <span>{t.pattern || "النمط"}:</span>
                                <span className="font-black text-center" dir="ltr">
                                    {ticket.patternData.split(',').map((n: string) => n.trim()).filter(Boolean).join('→')}
                                </span>
                            </div>
                        )}
                    </div>
                )}
                
                {ticket.conditionNotes && (
                    <div className="mt-1 text-[10px]">
                        <span className="font-bold">{t.conditionHeader || "الحالة"}: </span>
                        <span>{ticket.conditionNotes}</span>
                    </div>
                )}
            </div>

            {/* ── Issue Description ── */}
            <div className="section mb-3">
                <div className="font-black text-xs uppercase border-b border-black mb-1">
                    {t.issueLabel || "المشكلة"}
                </div>
                <div className="text-sm font-bold leading-tight py-1 px-1 italic">
                    {ticket.issueDescription}
                </div>
            </div>

            {/* ── Financials ── */}
            {(ticket.repairPrice > 0 || ticket.amountPaid > 0) && (
                <div className="section mb-4 bg-black text-white p-2 rounded-sm ring-1 ring-black">
                    <div className="flex justify-between items-center text-xs border-b border-white/30 pb-1 mb-1">
                        <span>{t.repairCost || "التكلفة"}</span>
                        <span className="font-black" dir="ltr">{formatCurrency(ticket.repairPrice, settings.currency)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs mb-1">
                    <span>{t.paid || "المدفوع"}</span>
                        <span className="font-black" dir="ltr">{formatCurrency(ticket.amountPaid || 0, settings.currency)}</span>
                    </div>
                    <div className="flex justify-between items-center text-base font-black pt-1 border-t border-white/50">
                        <span>{t.balanceDue || "المتبقي"}</span>
                        <span dir="ltr">{formatCurrency(Math.max(0, ticket.repairPrice - ticket.amountPaid), settings.currency)}</span>
                    </div>
                </div>
            )}

            {/* ── Expected Time ── */}
            {ticket.expectedDuration && (
                <div className="text-center mb-4 border-2 border-dashed border-black p-1">
                    <span className="text-[10px] font-bold">{t.expectedTime || "موعد الاستلام المتوقع"}:</span>
                    <div className="text-sm font-black text-blue-900">
                        {Number(ticket.expectedDuration) >= 60
                            ? `${(Number(ticket.expectedDuration) / 60).toFixed(1)} ساعة`
                            : `${ticket.expectedDuration} دقيقة`
                        }
                    </div>
                </div>
            )}

            {/* ── Terms & Agreement ── */}
            {t.termsHeader && (
                <div className="terms text-[9px] leading-tight text-center border-t border-black/40 pt-1 mb-4">
                    <div className="font-black mb-1">{t.termsHeader}</div>
                    <p className="opacity-80">
                        {t.terms1}<br/>
                        {t.terms2}<br/>
                        {t.terms3}
                    </p>
                </div>
            )}

            {/* ── Footer ── */}
            <div className="footer text-center mt-4 pt-2 border-t border-black">
                <div className="text-[10px] font-black mb-2 opacity-90">{settings.receiptFooter || "شكراً لثقتكم بنا"}</div>
                
                {/* Barcode centered */}
                <div className="flex flex-col items-center justify-center overflow-hidden" dir="ltr">
                    <Barcode
                        value={ticket.barcode}
                        width={paperSize === '58mm' ? 1.0 : 1.4}
                        height={30}
                        fontSize={10}
                        margin={0}
                        displayValue={false}
                    />
                    <div className="font-bold text-[10px] mt-1 tracking-widest">{ticket.barcode}</div>
                </div>
                
                <div className="text-[8px] mt-2 opacity-50 uppercase tracking-tighter">Powered by Casper POS</div>
            </div>
        </div>
    );
}
