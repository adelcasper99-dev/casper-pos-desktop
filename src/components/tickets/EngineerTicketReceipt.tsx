import { Ticket, ReceiptSettings } from "@/types/tickets";
import Barcode from "react-barcode";

interface EngineerTicketReceiptProps {
    ticket: Ticket;
    settings: ReceiptSettings;
    translations?: any;
}

export default function EngineerTicketReceipt({ ticket, settings, translations }: EngineerTicketReceiptProps) {
    if (!ticket || !settings) return null;

    const paperSize = settings.paperSize || "80mm";
    const paperWidth = paperSize === "58mm" ? "48mm" : "74mm";

    const dateStr = new Date(ticket.createdAt).toLocaleDateString('ar-EG', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const timeStr = new Date(ticket.createdAt).toLocaleTimeString('ar-EG', {
        hour: '2-digit', minute: '2-digit', hour12: true
    });

    const separator = "==========================================";
    const subSeparator = "------------------------------------------";

    return (
        <div 
            className="engineer-ticket-receipt font-mono text-black bg-white" 
            style={{ 
                direction: 'rtl', 
                width: '100%', 
                maxWidth: paperWidth, 
                margin: '0 auto',
                padding: '2mm 1mm',
                fontSize: paperSize === '58mm' ? '10px' : '11px',
                fontWeight: 600,
                lineHeight: 1.2
            }}
        >
            {/* ── Logo ── */}
            <div className="text-center mb-1">
                {settings?.logoUrl && settings.logoUrl !== "undefined" ? (
                    <img
                        src={settings.logoUrl}
                        alt="Logo"
                        className="w-12 h-12 object-contain grayscale mx-auto mb-1"
                    />
                ) : (
                    <div className="font-bold">[ شعار مركز الصيانة ]</div>
                )}
            </div>

            <div className="text-center font-bold mb-1">{separator}</div>
            <div className="text-center font-black text-sm my-2">*** إيصال استلام صيانة ***</div>
            <div className="text-center font-bold mb-2">{separator}</div>

            {/* ── Header Info ── */}
            <div className="space-y-1 mb-2">
                <div className="flex">
                    <span className="w-24">رقم الإيصال</span>
                    <span>: #{ticket.barcode}</span>
                </div>
                <div className="flex">
                    <span className="w-24">التاريخ</span>
                    <span>: {dateStr} - الساعة {timeStr}</span>
                </div>
                <div className="flex">
                    <span className="w-24">الموظف</span>
                    <span>: {ticket.createdBy?.name || ticket.employeeName || '...........'}</span>
                </div>
            </div>

            <div className="text-center font-bold mb-2">{separator}</div>

            {/* ── Customer & Device ── */}
            <div className="font-bold mb-1">[ بيانات العميل والجهاز ]</div>
            <div className="text-center border-t border-black/50 mb-2"></div>
            
            <div className="space-y-1.5 mb-2">
                <div className="flex">
                    <span className="w-28 italic">اسم العميل</span>
                    <span className="font-bold">: {ticket.customerName}</span>
                </div>
                <div className="flex">
                    <span className="w-28 italic">رقم الموبايل</span>
                    <span className="font-bold">: {ticket.customerPhone}</span>
                </div>
                <div className="flex">
                    <span className="w-28 italic">موديل الجهاز</span>
                    <span className="font-bold">: {ticket.deviceBrand} {ticket.deviceModel}</span>
                </div>
                <div className="flex">
                    <span className="w-28 italic">لون الجهاز</span>
                    <span className="font-bold">: {ticket.deviceColor || '...........'}</span>
                </div>
                <div className="flex">
                    <span className="w-28 italic">عطل</span>
                    <span className="font-bold">: {ticket.issueDescription}</span>
                </div>
                <div className="mt-1">
                    <span className="italic">ملاحظات:</span>
                    <span className="block mt-1 whitespace-pre-wrap">{ticket.conditionNotes || '....................'}</span>
                </div>
            </div>

            <div className="text-center font-bold mb-2">{separator}</div>

            {/* ── Engineer Section ── */}
            <div className="font-bold mb-1">[ نسخة المهندس / الاستخدام الداخلي ]</div>
            <div className="space-y-2 mt-2">
                <div className="flex">
                    <span className="w-32 italic">اسم المهندس</span>
                    <span>: .....................</span>
                </div>
                <div className="flex">
                    <span className="w-32 italic">وقت الإصلاح الفعلي</span>
                    <span>: .....................</span>
                </div>
                <div className="flex">
                    <span className="w-32 italic">وقت التسليم للعميل</span>
                    <span>: .....................</span>
                </div>
                <div className="flex">
                    <span className="w-32 italic">قطعة الغيار</span>
                    <span>: .....................</span>
                </div>
                <div className="flex">
                    <span className="w-32 italic">التكلفة النهائية</span>
                    <span>: .....................</span>
                </div>
            </div>

            <div className="mt-4">
                <div className="italic mb-1">سبب الرفض/ملاحظات:</div>
                <div className="border-b border-black/30 h-6"></div>
                <div className="border-b border-black/30 h-6"></div>
            </div>

            <div className="text-center font-bold mt-4 mb-2">{separator}</div>

            {/* ── Footer ── */}
            <div className="flex flex-col items-center justify-center mt-2">
                <Barcode
                    value={ticket.barcode}
                    width={paperSize === '58mm' ? 1.0 : 1.2}
                    height={25}
                    fontSize={10}
                    margin={0}
                    displayValue={false}
                />
                <div className="text-[10px] mt-1 font-bold">{ticket.barcode}</div>
            </div>
            
            <div className="text-[8px] text-center mt-2 opacity-50">ENGINEER COPY - CASPER POS</div>
        </div>
    );
}
