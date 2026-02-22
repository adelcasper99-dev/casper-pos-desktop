import React from 'react';
import Barcode from 'react-barcode';
import { formatArabicPrintText } from '@/lib/arabic-reshaper';

interface TicketStickerLabelProps {
    ticket: {
        id: string;
        barcode: string;
        customerName: string;
        customerPhone?: string;
        deviceBrand?: string;
        deviceModel?: string;
        deviceImei?: string;
        deviceColor?: string;
        issueDescription?: string;
        expectedDuration?: number | string;
        createdAt: string | Date;
        securityCode?: string;
        patternData?: string;
    };
    storeName?: string;
    translations?: any;
}

/**
 * Ticket Sticker Label
 * Optimized for ~50x30mm thermal labels
 * Mirror-Layout: LTR container, RTL text alignment
 */
export default function TicketStickerLabel({ ticket, storeName = "CASPER POS", translations }: TicketStickerLabelProps) {

    const formatText = (text: string) => formatArabicPrintText(text || "");

    return (
        <table style={{
            width: '50mm',
            height: '30mm',
            borderCollapse: 'collapse',
            fontFamily: 'Arial, sans-serif',
            backgroundColor: 'transparent',
            color: 'black',
            direction: 'ltr', // Mirror-Layout
            tableLayout: 'fixed'
        }}>
            <tbody>
                {/* Header / Store Name */}
                <tr>
                    <td style={{ height: '15%', textAlign: 'center', verticalAlign: 'top', paddingTop: '1mm' }}>
                        <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{formatText(storeName)}</div>
                    </td>
                </tr>

                {/* Content Row - Ticket Info */}
                <tr>
                    <td style={{ verticalAlign: 'top', padding: '0 1mm', textAlign: 'right' }}>
                        {/* Top: Customer & Device */}
                        <div style={{ borderBottom: '1px solid black', paddingBottom: '2px', marginBottom: '1px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {formatText(ticket.customerName.substring(0, 18))}
                            </div>
                            {ticket.customerPhone && (
                                <div style={{ fontSize: '9px', direction: 'ltr' }}>{ticket.customerPhone}</div>
                            )}
                            <div style={{ fontSize: '8px', marginTop: '1px' }}>
                                {formatText(`${ticket.deviceBrand} ${ticket.deviceModel}`)}
                            </div>
                            {ticket.deviceImei && (
                                <div style={{ fontSize: '8px', direction: 'ltr' }}>IMEI: {ticket.deviceImei.substring(ticket.deviceImei.length - 6)}..</div>
                            )}
                        </div>

                        {/* Middle: Issue & Duration */}
                        <div style={{ fontSize: '9px' }}>
                            {ticket.issueDescription && (
                                <div style={{
                                    fontWeight: 'bold',
                                    marginBottom: '1px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {formatText(ticket.issueDescription)}
                                </div>
                            )}

                            {(ticket.expectedDuration !== undefined && ticket.expectedDuration !== null && ticket.expectedDuration !== 0) ? (
                                <div style={{ fontSize: '8px', fontWeight: '900', borderTop: '0.5mm solid transparent', display: 'flex', justifyContent: 'flex-end', gap: '2px' }}>
                                    <span>
                                        {Number(ticket.expectedDuration) >= 60
                                            ? formatText(`${(Number(ticket.expectedDuration) / 60).toFixed(1)} ساعة`)
                                            : formatText(`${ticket.expectedDuration} دقيقة`)
                                        }
                                    </span>
                                    <span>{formatText(translations?.expectedTime || "الوقت")}: </span>
                                </div>
                            ) : null}

                            {ticket.securityCode && (
                                <div style={{ fontSize: '8px', fontWeight: '900', marginTop: '1px', display: 'flex', justifyContent: 'flex-end', gap: '2px' }}>
                                    <span>{ticket.securityCode}</span>
                                    <span>{formatText(translations?.security || "رمز")}: </span>
                                </div>
                            )}

                            {ticket.patternData && (
                                <div style={{ fontSize: '8px', fontWeight: '900', marginTop: '1px', display: 'flex', justifyContent: 'flex-end', gap: '2px' }}>
                                    <span style={{ direction: 'ltr' }}>
                                        {ticket.patternData.split(',').map(n => {
                                            const num = parseInt(n.trim());
                                            return isNaN(num) ? n : (num + 1).toString();
                                        }).join('-')}
                                    </span>
                                    <span>{formatText(translations?.pattern || "نمط")}: </span>
                                </div>
                            )}
                        </div>
                    </td>
                </tr>

                {/* Footer - Barcode */}
                <tr>
                    <td style={{ height: '30%', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: '1mm' }}>
                        <div style={{ display: 'inline-block' }}>
                            <Barcode
                                value={ticket.barcode || ticket.id.substring(0, 8)}
                                width={1.1}
                                height={12}
                                fontSize={0}
                                margin={0}
                                displayValue={false}
                                renderer="svg"
                            />
                        </div>
                        <div style={{ fontSize: '8px', fontWeight: 'bold', textAlign: 'center' }}>#{ticket.barcode}</div>
                    </td>
                </tr>
            </tbody>
        </table>
    );
}
