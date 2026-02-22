import { formatCurrency } from "@/lib/utils";
import Barcode from "react-barcode";
import { formatArabicPrintText } from "@/lib/arabic-reshaper";
import { Ticket, ReceiptSettings } from "@/types/tickets";

interface TicketPrintTemplateProps {
    ticket: Ticket;
    settings: ReceiptSettings;
    translations?: any;
}

export default function TicketPrintTemplate({ ticket, settings, translations }: TicketPrintTemplateProps) {
    if (!ticket || !settings) return null;

    const t = translations || {};

    // Apply Arabic Reshaping if text contains Arabic
    const formatText = (text: string) => formatArabicPrintText(text || "");

    return (
        <div className="p-4 font-mono text-sm bg-transparent text-black h-auto" style={{ direction: 'ltr' }}>
            {/* Header */}
            <div className="header text-center border-b-2 border-dashed border-black/80 pb-4 mb-4" style={{ textAlign: 'center' }}>
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
                    <div className="text-xs font-bold mb-2 whitespace-pre-wrap">{formatText(settings.printHeader)}</div>
                )}
                <h3 className="text-xl font-black tracking-widest uppercase">{formatText(settings.name)}</h3>
                {settings.address && (
                    <p className="text-xs font-bold mt-1">{formatText(settings.address || "")}</p>
                )}
                <div className="mt-4 border-2 border-black p-2 inline-block rounded font-black text-xl">
                    #{ticket.barcode}
                </div>
                <p className="text-xs mt-2 text-zinc-600">{new Date(ticket.createdAt).toLocaleString('en-GB')}</p>
            </div>

            {/* Customer */}
            <div className="mb-4" style={{ textAlign: 'right' }}>
                <div className="text-xs font-bold border-b border-black mb-1">{formatText(t.customerHeader || "Customer Info")}</div>
                <div className="item flex justify-between flex-row-reverse">
                    <span>{formatText(t.name || "Name")}</span>
                    <span className="font-bold">{formatText(ticket.customerName)}</span>
                </div>
                <div className="item flex justify-between flex-row-reverse">
                    <span>{formatText(t.phone || "Phone")}</span>
                    <span className="font-bold">{ticket.customerPhone}</span>
                </div>
            </div>

            {/* Device */}
            <div className="mb-4" style={{ textAlign: 'right' }}>
                <div className="text-xs font-bold border-b border-black mb-1">{formatText(t.deviceHeader || "Device Details")}</div>
                <div className="item flex justify-between flex-row-reverse">
                    <span>{formatText(t.device || "Device")}</span>
                    <span className="font-bold">{formatText(`${ticket.deviceBrand} ${ticket.deviceModel}`)}</span>
                </div>
                {ticket.deviceImei && (
                    <div className="item flex justify-between flex-row-reverse">
                        <span>IMEI</span>
                        <span className="font-bold">{ticket.deviceImei}</span>
                    </div>
                )}
                <div className="item flex justify-between flex-row-reverse">
                    <span>{formatText(t.detail || "Color")}</span>
                    <span className="font-bold">{formatText(ticket.deviceColor || '-')}</span>
                </div>
                {/* Condition */}
                {ticket.conditionNotes && (
                    <div className="item flex justify-between flex-row-reverse mt-1">
                        <span>{formatText(t.conditionHeader || "Condition")}</span>
                        <span className="font-bold">{formatText(ticket.conditionNotes)}</span>
                    </div>
                )}

                {/* Expected Time */}
                {ticket.expectedDuration ? (
                    <div className="item flex justify-between flex-row-reverse mt-1 pt-1 border-t border-dotted border-black/30">
                        <span>{formatText(t.expectedTime || "Expected")}</span>
                        <span className="font-bold text-cyan-900">
                            {Number(ticket.expectedDuration) >= 60
                                ? formatText(`${(Number(ticket.expectedDuration) / 60).toFixed(1)} ساعة`)
                                : formatText(`${ticket.expectedDuration} دقيقة`)
                            }
                        </span>
                    </div>
                ) : null}

            </div>

            {/* Issue */}
            <div className="mb-4" style={{ textAlign: 'right' }}>
                <div className="text-xs font-bold border-b border-black mb-1">{formatText(t.issueHeader || "Issue")}</div>
                <div className="p-1 text-sm">
                    {formatText(ticket.issueDescription)}
                </div>

            </div>

            {/* Financial Details */}
            {(ticket.repairPrice > 0 || ticket.amountPaid > 0) && (
                <div className="mb-4" style={{ textAlign: 'right' }}>
                    <div className="text-xs font-bold border-b border-black mb-1 flex items-center justify-between flex-row-reverse">
                        <span>{formatText(t.financialHeader || "Financials")}</span>
                    </div>

                    {/* Repair Cost - Standard */}
                    <div className="item flex justify-between flex-row-reverse text-sm mb-1">
                        <span>{formatText(t.repairCost || "Total")}</span>
                        <span className="font-bold">{formatCurrency(ticket.repairPrice, settings.currency)}</span>
                    </div>

                    {/* Paid - Green if > 0 */}
                    <div className="item flex justify-between flex-row-reverse text-sm mb-1">
                        <span>{formatText(t.paid || "Paid")}</span>
                        <span className={`font-bold ${ticket.amountPaid > 0 ? 'text-black' : ''}`}>
                            {formatCurrency(ticket.amountPaid || 0, settings.currency)}
                        </span>
                    </div>

                    {/* Due - Red/Bold if > 0 */}
                    <div className="item flex justify-between flex-row-reverse text-base font-black border-t border-black/20 mt-1 pt-1">
                        <span>{formatText(t.due || "Balance")}</span>
                        <span>
                            {formatCurrency(Math.max(0, (ticket.repairPrice || 0) - (ticket.amountPaid || 0)), settings.currency)}
                        </span>
                    </div>
                </div>
            )}

            {/* Agreement / Terms */}
            {t.termsHeader && (
                <div className="mt-6 text-xs text-justify leading-tight border-t border-black pt-2" style={{ textAlign: 'center' }}>
                    <p className="mb-2 font-bold text-center">{formatText(t.termsHeader)}</p>
                    <p>
                        {formatText(t.terms1 || "")}
                        <br />
                        {formatText(t.terms2 || "")}
                        <br />
                        {formatText(t.terms3 || "")}
                    </p>
                </div>
            )}

            {/* Footer */}
            <div className="footer text-center text-xs font-bold text-black mt-6 space-y-1 whitespace-pre-wrap" style={{ textAlign: 'center' }}>
                {formatText(settings.receiptFooter || "Thank you")}
            </div>

            <div className="text-center mt-6 flex flex-col items-center justify-center overflow-hidden">
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
