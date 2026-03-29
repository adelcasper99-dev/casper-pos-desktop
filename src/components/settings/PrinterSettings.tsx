'use client';

import { useState, useEffect } from 'react';
import { Printer, RefreshCw, Save, CheckCircle, AlertCircle, ShieldCheck, Download, Loader2, Zap, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { printService } from '@/lib/print-service';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";
import { checkQZCertificateStatus, installQZCertificate } from '@/actions/qz-actions';

type CertStatus = 'checking' | 'not-installed' | 'mismatch' | 'installed' | 'qz-missing';

export default function PrinterSettings() {
    const [printers, setPrinters] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [qzStatus, setQzStatus] = useState<{ online: boolean; version?: string } | null>(null);
    const [certStatus, setCertStatus] = useState<CertStatus>('checking');
    const [installing, setInstalling] = useState(false);

    // Preferences
    const [thermalPrinter, setThermalPrinter] = useState<string>('');
    const [a4Printer, setA4Printer] = useState<string>('');
    const [receiptFormat, setReceiptFormat] = useState<'thermal' | 'a4'>('thermal');
    const [labelPrinter, setLabelPrinter] = useState<string>('');
    const [enableThermal, setEnableThermal] = useState<boolean>(true);
    const [enableA4, setEnableA4] = useState<boolean>(true);
    const [enableSpeedPrint, setEnableSpeedPrint] = useState<boolean>(true);
    const [defaultCopies, setDefaultCopies] = useState<number>(1);

    useEffect(() => {
        loadSettings();
        checkQZConnection();
        checkCertStatus();
    }, []);

    const loadSettings = () => {
        const registry = printService.getRegistry();
        if (registry) {
            if (registry.thermalPrinter) setThermalPrinter(registry.thermalPrinter);
            if (registry.a4Printer) setA4Printer(registry.a4Printer);
            if (registry.receiptFormat) setReceiptFormat(registry.receiptFormat);
            if (registry.labelPrinter) setLabelPrinter(registry.labelPrinter);
            setEnableThermal(registry.enableThermal !== false);
            setEnableA4(registry.enableA4 !== false);
            setEnableSpeedPrint(registry.enableSpeedPrint !== false);
            if (registry.defaultCopies) setDefaultCopies(registry.defaultCopies);
        } else {
            const savedThermal = localStorage.getItem('thermal_printer');
            const savedA4 = localStorage.getItem('a4_printer');
            const savedLabel = localStorage.getItem('printer_label');
            const savedCopies = localStorage.getItem('casper_default_print_copies');
            if (savedThermal) setThermalPrinter(savedThermal);
            if (savedA4) setA4Printer(savedA4);
            if (savedLabel) setLabelPrinter(savedLabel);
            if (savedCopies) setDefaultCopies(parseInt(savedCopies, 10) || 1);
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
            if (!status.qzInstalled) setCertStatus('qz-missing');
            else if (!status.installed) setCertStatus('not-installed');
            else if (!status.matched) setCertStatus('mismatch');
            else setCertStatus('installed');
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
                setTimeout(() => checkQZConnection(), 4000);
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
        window.open('/qz-setup/install-qz-cert.bat', '_blank');
        toast.info('Script downloaded! Right-click → Run as Administrator');
    };

    const handleSave = () => {
        printService.updateRegistry({
            thermalPrinter, a4Printer, receiptFormat, labelPrinter,
            enableThermal, enableA4, enableSpeedPrint, defaultCopies
        });
        localStorage.setItem('casper_default_print_copies', defaultCopies.toString());
        toast.success("Printer preferences saved to this device registry");
    };

    const handleTestReceipt = async () => {
        const target = receiptFormat === 'a4' ? a4Printer : thermalPrinter;
        if (!target || target === 'none') return toast.error("Select a printer first");
        try {
            const t = toast.loading("Sending test receipt...");
            await printService.testPrint(target);
            toast.dismiss(t);
            toast.success("Test sent to " + target);
        } catch (e: any) {
            toast.error("Print failed: " + e.message);
        }
    };

    const getCertStatusDisplay = () => {
        switch (certStatus) {
            case 'checking':
                return { color: 'text-muted-foreground bg-muted/10 border-border/20', icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Checking Integrity...', desc: 'Verifying local security certificates' };
            case 'installed':
                return { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5', icon: <ShieldCheck className="w-5 h-5 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />, label: 'Security Trusted', desc: 'Hardware telemetry and silent printing active' };
            case 'not-installed':
            case 'mismatch':
                return { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20 shadow-amber-500/5', icon: <AlertCircle className="w-5 h-5" />, label: 'Update Required', desc: 'Secure connection requires certificate setup' };
            case 'qz-missing':
                return { color: 'text-rose-400 bg-rose-500/10 border-rose-500/20 shadow-rose-500/5', icon: <AlertCircle className="w-5 h-5" />, label: 'Host Software Missing', desc: 'Install QZ Tray to enable local printing' };
        }
    };

    const certDisplay = getCertStatusDisplay();

    return (
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-700">
            {/* Host Connection Status */}
            <div className={cn(
                "glass-card backdrop-blur-xl p-6 rounded-3xl border flex items-center gap-6 shadow-2xl transition-all duration-500 group",
                qzStatus?.online ? "bg-emerald-500/5 border-emerald-500/30" : "bg-rose-500/5 border-rose-500/30"
            )}>
                <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-xl",
                    qzStatus?.online ? "bg-emerald-500/20 text-emerald-400 shadow-emerald-500/20" : "bg-rose-500/20 text-rose-400 shadow-rose-500/20"
                )}>
                    {qzStatus?.online ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                </div>
                <div className="flex-1">
                    <div className="text-sm font-black uppercase tracking-widest opacity-60 mb-0.5">Host Connection</div>
                    <div className="text-xl font-black tracking-tight">{qzStatus?.online ? "Local Service Online" : "Service Offline"}</div>
                    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-1">
                        {qzStatus?.online ? `Protocol Version v${qzStatus.version}` : "Connection to QZ Tray failed on this device"}
                    </div>
                </div>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={checkQZConnection} 
                    disabled={loading} 
                    className="h-12 w-12 rounded-2xl bg-card/40 border border-border/40 hover:bg-card hover:border-border transition-all group-hover:rotate-180 duration-700"
                >
                    <RefreshCw className={cn("w-5 h-5", loading ? "animate-spin" : "")} />
                </Button>
            </div>

            {/* QZ Tray Security Card */}
            <div className="glass-card bg-card/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-border/40 shadow-2xl space-y-8 group/security relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 blur-3xl opacity-0 group-hover/security:opacity-100 transition-opacity" />
                <div className="space-y-2 relative z-10">
                    <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                        <ShieldCheck className="w-6 h-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                        Infrastructure Security
                    </h3>
                    <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-9 opacity-60">Manage silent printing and hardware trust</p>
                </div>

                <div className={cn("p-6 rounded-3xl border transition-all duration-300 flex items-center gap-5", certDisplay.color)}>
                    <div className="shrink-0">{certDisplay.icon}</div>
                    <div className="flex-1 min-w-0">
                        <div className="font-black text-sm uppercase tracking-widest">{certDisplay.label}</div>
                        <div className="text-xs font-medium opacity-60">{certDisplay.desc}</div>
                    </div>
                    {certStatus !== 'installed' && certStatus !== 'checking' && certStatus !== 'qz-missing' && (
                        <div className="flex gap-2">
                             <Button
                                size="sm"
                                onClick={handleInstallCert}
                                disabled={installing}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white font-black text-[10px] uppercase tracking-widest px-6 rounded-xl h-10 shadow-lg"
                            >
                                {installing ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Zap className="w-3 h-3 mr-2 group-hover:scale-110 transition-transform" />}
                                Setup Integrity
                            </Button>
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={handleDownloadScript}
                                className="border-white/10 text-white hover:bg-white/10 rounded-xl h-10 w-10 transition-all"
                            >
                                <Download className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Printer Assignment Matrix */}
            <div className="glass-card bg-card/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-border/40 shadow-2xl relative overflow-hidden group/matrix">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover/matrix:bg-primary/10 transition-colors" />
                
                <div className="space-y-10 relative z-10">
                    <div className="space-y-2">
                        <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                            <Printer className="w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                            Telemetry Routing
                        </h3>
                        <p className="text-[10px] uppercase font-black tracking-widest text-muted-foreground ml-9 opacity-60">Route POS documents to local physical devices</p>
                    </div>

                    <div className="grid gap-8">
                        {/* Thermal Configuration */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className={cn("text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1", enableThermal ? "text-foreground" : "opacity-40")}>Thermal Direct (80mm / 58mm)</Label>
                                <div className="flex items-center gap-3 bg-background/40 px-3 py-1.5 rounded-2xl border border-border/40">
                                    <span className={cn("text-[8px] font-black uppercase tracking-widest", enableThermal ? "text-emerald-400" : "text-muted-foreground/40")}>{enableThermal ? 'Broadcasting' : 'Blocked'}</span>
                                    <Switch
                                        checked={enableThermal}
                                        onCheckedChange={(val) => {
                                            setEnableThermal(val);
                                            if (!val && receiptFormat === 'thermal') setReceiptFormat('a4');
                                        }}
                                    />
                                </div>
                            </div>

                            {enableThermal && (
                                <Select
                                    value={thermalPrinter || "none"}
                                    onValueChange={(val) => {
                                        setThermalPrinter(val);
                                        if (val !== 'none') setReceiptFormat('thermal');
                                    }}
                                    disabled={!qzStatus?.online}
                                >
                                    <SelectTrigger className="glass-card bg-background/40 border-border/40 text-foreground font-black text-xs h-14 rounded-2xl px-6 focus:ring-primary/20 transition-all animate-in zoom-in-95 duration-200">
                                        <SelectValue placeholder="Select high-speed thermal target..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card/95 backdrop-blur-2xl border-border/40 rounded-2xl text-foreground">
                                        <SelectItem value="none" className="font-black text-xs uppercase tracking-widest py-3">/ Disabled Routing</SelectItem>
                                        {printers.map(p => (
                                            <SelectItem key={p} value={p} className="font-bold text-sm py-3 mb-1 rounded-xl transition-colors">{p}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* A4 Configuration */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className={cn("text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1", enableA4 ? "text-foreground" : "opacity-40")}>Document Printing (A4 / Laser)</Label>
                                <div className="flex items-center gap-3 bg-background/40 px-3 py-1.5 rounded-2xl border border-border/40">
                                    <span className={cn("text-[8px] font-black uppercase tracking-widest", enableA4 ? "text-sky-400" : "text-muted-foreground/40")}>{enableA4 ? 'Active' : 'Offline'}</span>
                                    <Switch
                                        checked={enableA4}
                                        onCheckedChange={(val) => {
                                            setEnableA4(val);
                                            if (!val && receiptFormat === 'a4') setReceiptFormat('thermal');
                                        }}
                                    />
                                </div>
                            </div>

                            {enableA4 && (
                                <Select
                                    value={a4Printer || "none"}
                                    onValueChange={(val) => {
                                        setA4Printer(val);
                                        if (val !== 'none') setReceiptFormat('a4');
                                    }}
                                    disabled={!qzStatus?.online}
                                >
                                    <SelectTrigger className="glass-card bg-background/40 border-border/40 text-foreground font-black text-xs h-14 rounded-2xl px-6 focus:ring-primary/20 transition-all animate-in zoom-in-95 duration-200">
                                        <SelectValue placeholder="Select document printer destination..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-card/95 backdrop-blur-2xl border-border/40 rounded-2xl text-foreground">
                                        <SelectItem value="none" className="font-black text-xs uppercase tracking-widest py-3">/ Manual Handover</SelectItem>
                                        {printers.map(p => (
                                            <SelectItem key={p} value={p} className="font-bold text-sm py-3 mb-1 rounded-xl transition-colors">{p}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </div>

                        {/* Label Configuration */}
                        <div className="space-y-4">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Asset Labelling (Sticky 50x30mm)</Label>
                            <Select value={labelPrinter} onValueChange={setLabelPrinter} disabled={!qzStatus?.online}>
                                <SelectTrigger className="glass-card bg-background/40 border-border/40 text-foreground font-black text-xs h-14 rounded-2xl px-6 focus:ring-primary/20 transition-all">
                                    <SelectValue placeholder="Select automated label target..." />
                                </SelectTrigger>
                                <SelectContent className="bg-card/95 backdrop-blur-2xl border-border/40 rounded-2xl text-foreground">
                                    <SelectItem value="none" className="font-black text-xs uppercase tracking-widest py-3 hover:text-primary transition-colors">/ Use OS Dialog</SelectItem>
                                    {printers.map(p => (
                                        <SelectItem key={p} value={p} className="font-bold text-sm py-3 mb-1 rounded-xl transition-colors">{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-10 border-t border-border/20">
                         {/* Iteration Control */}
                         <div className="space-y-4">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Batch Sequence (Default Copies)</Label>
                            <div className="flex items-center gap-6 bg-background/40 border border-border/40 p-4 rounded-3xl w-fit">
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => setDefaultCopies(prev => Math.max(1, prev - 1))}
                                    className="w-10 h-10 rounded-xl bg-card border border-border/40 hover:bg-rose-500/10 hover:text-rose-400 transition-all"
                                >
                                    -
                                </Button>
                                <div className="min-w-[40px] text-center text-3xl font-black text-primary font-mono drop-shadow-[0_0_10px_rgba(var(--primary),0.3)]">
                                    {defaultCopies}
                                </div>
                                <Button 
                                    size="icon" 
                                    variant="ghost" 
                                    onClick={() => setDefaultCopies(prev => Math.min(10, prev + 1))}
                                    className="w-10 h-10 rounded-xl bg-card border border-border/40 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all"
                                >
                                    +
                                </Button>
                            </div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 leading-tight">Automated duplication per transaction</p>
                        </div>

                        {/* Speed Print Toggle */}
                        <div className="flex items-center justify-between p-6 border border-border/40 rounded-[2rem] bg-indigo-500/5 group/speed hover:bg-indigo-500/10 transition-all duration-500">
                             <div className="space-y-1">
                                <Label className="text-[10px] font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                                   <Zap className="w-3 h-3 text-indigo-400" /> Matrix-Checkout
                                </Label>
                                <p className="text-[9px] font-bold text-muted-foreground/60 leading-tight">Direct routing bypassing interface confirmation</p>
                             </div>
                             <Switch
                                checked={enableSpeedPrint}
                                onCheckedChange={setEnableSpeedPrint}
                             />
                        </div>
                    </div>

                    {/* Operational Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-10">
                        {(enableThermal || enableA4) && (
                            <Button 
                                variant="ghost" 
                                onClick={handleTestReceipt}
                                className="font-black text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors flex gap-2"
                            >
                                <RefreshCw className="w-3 h-3" /> Execute Integrity Test
                            </Button>
                        )}
                        <Button 
                            onClick={handleSave} 
                            className="bg-primary hover:bg-primary/90 px-10 h-14 rounded-2xl text-white font-black uppercase tracking-widest gap-3 shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            <Save className="w-5 h-5" /> Commit Preferences
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
