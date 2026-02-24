'use client';

import { useState, useEffect } from 'react';
// import { useTranslations } from 'next-intl';
import { Printer, RefreshCw, Save, CheckCircle, AlertCircle, ShieldCheck, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { printService } from '@/lib/print-service';
import { toast } from 'sonner';
import { checkQZCertificateStatus, installQZCertificate } from '@/actions/qz-actions';

type CertStatus = 'checking' | 'not-installed' | 'mismatch' | 'installed' | 'qz-missing';

export default function PrinterSettings() {
    // const t = useTranslations('Common'); // Commented out to avoid build error if unused or namespace missing
    const [printers, setPrinters] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [qzStatus, setQzStatus] = useState<{ online: boolean; version?: string } | null>(null);
    const [certStatus, setCertStatus] = useState<CertStatus>('checking');
    const [installing, setInstalling] = useState(false);

    // Preferences
    const [receiptPrinter, setReceiptPrinter] = useState<string>('');
    const [receiptFormat, setReceiptFormat] = useState<'thermal' | 'a4'>('thermal');
    const [labelPrinter, setLabelPrinter] = useState<string>('');

    useEffect(() => {
        loadSettings();
        checkQZConnection();
        checkCertStatus();
    }, []);

    const loadSettings = () => {
        const registry = printService.getRegistry();
        if (registry) {
            if (registry.receiptPrinter) setReceiptPrinter(registry.receiptPrinter);
            if (registry.receiptFormat) setReceiptFormat(registry.receiptFormat);
            if (registry.labelPrinter) setLabelPrinter(registry.labelPrinter);
        } else {
            // Fallback for immediate load after migration
            const savedReceipt = localStorage.getItem('printer_receipt');
            const savedLabel = localStorage.getItem('printer_label');
            if (savedReceipt) setReceiptPrinter(savedReceipt);
            if (savedLabel) setLabelPrinter(savedLabel);
        }
    };

    const checkQZConnection = async () => {
        setLoading(true);
        try {
            const status = await printService.getStatus();
            setQzStatus({ online: status.online, version: status.version });

            if (status.online) {
                const printerList = await printService.getPrinters();
                setPrinters(printerList);
            }
        } catch (error) {
            console.error("QZ Tray Error:", error);
            setQzStatus({ online: false });
        } finally {
            setLoading(false);
        }
    };

    const checkCertStatus = async () => {
        setCertStatus('checking');
        try {
            const status = await checkQZCertificateStatus();
            if (!status.qzInstalled) {
                setCertStatus('qz-missing');
            } else if (!status.installed) {
                setCertStatus('not-installed');
            } else if (!status.matched) {
                setCertStatus('mismatch');
            } else {
                setCertStatus('installed');
            }
        } catch {
            setCertStatus('not-installed');
        }
    };

    const handleInstallCert = async () => {
        setInstalling(true);
        try {
            const result = await installQZCertificate();
            if (result.success) {
                toast.success(result.message);
                setCertStatus('installed');
                // Re-check connection after restart
                setTimeout(() => checkQZConnection(), 4000);
            } else if (result.needsManual) {
                toast.error(result.message);
            } else {
                toast.error(result.message);
            }
        } catch (error: any) {
            toast.error('Setup failed: ' + error.message);
        } finally {
            setInstalling(false);
            checkCertStatus();
        }
    };

    const handleDownloadScript = () => {
        // Download both files as a zip-like approach: just link to the bat file
        // The certificate is already in the same public folder
        window.open('/qz-setup/install-qz-cert.bat', '_blank');
        toast.info('Script downloaded! Right-click → Run as Administrator');
    };

    const handleSave = () => {
        printService.updateRegistry({
            receiptPrinter: receiptPrinter,
            receiptFormat: receiptFormat,
            labelPrinter: labelPrinter
        });
        toast.success("Printer preferences saved to this device registry");
    };

    const handleTestReceipt = async () => {
        if (!receiptPrinter) return toast.error("Select a receipt printer first");
        try {
            toast.loading("Sending test receipt...");
            await printService.testPrint(receiptPrinter);
            toast.success("Test sent to " + receiptPrinter);
        } catch (e: any) {
            toast.error("Print failed: " + e.message);
        }
    };

    const getCertStatusDisplay = () => {
        switch (certStatus) {
            case 'checking':
                return { color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20', icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Checking...', desc: '' };
            case 'installed':
                return { color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <ShieldCheck className="w-4 h-4" />, label: 'Certificate Installed', desc: 'Silent printing is enabled on this PC.' };
            case 'not-installed':
                return { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: <AlertCircle className="w-4 h-4" />, label: 'Certificate Not Installed', desc: 'Click "Setup" to enable silent printing.' };
            case 'mismatch':
                return { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: <AlertCircle className="w-4 h-4" />, label: 'Certificate Outdated', desc: 'Click "Setup" to update the certificate.' };
            case 'qz-missing':
                return { color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: <AlertCircle className="w-4 h-4" />, label: 'QZ Tray Not Installed', desc: 'Install QZ Tray first from qz.io/download' };
        }
    };

    const certDisplay = getCertStatusDisplay();

    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
            {/* QZ Tray Setup Card */}
            <Card className="glass-card bg-transparent border-white/10 text-white">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck className="h-5 w-5 text-cyan-400" />
                        QZ Tray Setup
                    </CardTitle>
                    <CardDescription className="text-zinc-400">
                        One-click setup for silent printing on this PC.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {/* Certificate Status */}
                    <div className={`flex items-center gap-3 p-3 rounded-lg border ${certDisplay.color}`}>
                        {certDisplay.icon}
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{certDisplay.label}</div>
                            {certDisplay.desc && <div className="text-xs opacity-70">{certDisplay.desc}</div>}
                        </div>
                        {certStatus !== 'installed' && certStatus !== 'checking' && certStatus !== 'qz-missing' && (
                            <div className="flex gap-2 shrink-0">
                                <Button
                                    size="sm"
                                    onClick={handleInstallCert}
                                    disabled={installing}
                                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
                                >
                                    {installing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
                                    Setup
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleDownloadScript}
                                    className="border-white/20 text-white hover:bg-white/5 text-xs"
                                    title="Download setup script (run as admin)"
                                >
                                    <Download className="w-3 h-3" />
                                </Button>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Printer Assignment Card */}
            <Card className="glass-card bg-transparent border-white/10 text-white">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Printer className="h-5 w-5 text-cyan-400" />
                        Printer Assignment
                    </CardTitle>
                    <CardDescription className="text-zinc-400">
                        Configure default printers for this specific device. Requires QZ Tray.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* Status Indicator */}
                    <div className={`flex items-center gap-2 p-3 rounded-lg border ${qzStatus?.online ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                        {qzStatus?.online ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <div className="flex-1">
                            <div className="font-medium">{qzStatus?.online ? "QZ Tray Connected" : "QZ Tray Not Detected"}</div>
                            {qzStatus?.online && <div className="text-xs opacity-70">Version: {qzStatus.version}</div>}
                            {!qzStatus?.online && <div className="text-xs opacity-70">Please ensure QZ Tray is running on your computer.</div>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={checkQZConnection} disabled={loading} className="hover:bg-white/5">
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>

                    <div className="grid gap-4">
                        {/* Receipt Printer Selection */}
                        <div className="space-y-2">
                            <Label>Default Receipt Printer (A4 / 80mm)</Label>
                            <Select value={receiptPrinter} onValueChange={setReceiptPrinter} disabled={!qzStatus?.online}>
                                <SelectTrigger className="glass-input bg-black/20 border-white/10 text-white">
                                    <SelectValue placeholder="Select printer..." />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                    <SelectItem value="none">-- None (Use Browser Dialog) --</SelectItem>
                                    {printers.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {receiptPrinter && (
                                <Button variant="link" size="sm" className="text-cyan-400 h-auto p-0" onClick={handleTestReceipt}>
                                    Test Print
                                </Button>
                            )}
                        </div>

                        {/* Receipt Format Selection */}
                        <div className="space-y-2">
                            <Label>Receipt Format / Layout</Label>
                            <Select value={receiptFormat} onValueChange={(val: any) => setReceiptFormat(val)}>
                                <SelectTrigger className="glass-input bg-black/20 border-white/10 text-white">
                                    <SelectValue placeholder="Select format..." />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                    <SelectItem value="thermal">Thermal Roll (80mm/58mm)</SelectItem>
                                    <SelectItem value="a4">Standard Invoice (A4)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Label Printer Selection */}
                        <div className="space-y-2">
                            <Label>Default Label Printer (Sticky 50x30mm)</Label>
                            <Select value={labelPrinter} onValueChange={setLabelPrinter} disabled={!qzStatus?.online}>
                                <SelectTrigger className="glass-input bg-black/20 border-white/10 text-white">
                                    <SelectValue placeholder="Select printer..." />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                                    <SelectItem value="none">-- None (Use Browser Dialog) --</SelectItem>
                                    {printers.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-500 text-white gap-2">
                            <Save className="w-4 h-4" /> Save Preferences
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
