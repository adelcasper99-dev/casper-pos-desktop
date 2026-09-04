'use client';

import { useState, useEffect, useRef } from 'react';
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
    const [bridgeIpAddress, setBridgeIpAddress] = useState<string>('');
    const [thermalPrinter, setThermalPrinter] = useState<string>('');
    const [a4Printer, setA4Printer] = useState<string>('');
    const [receiptFormat, setReceiptFormat] = useState<'thermal' | 'a4'>('thermal');
    const [labelPrinter, setLabelPrinter] = useState<string>('');
    const [enableThermal, setEnableThermal] = useState<boolean>(true);
    const [enableA4, setEnableA4] = useState<boolean>(true);
    const [enableSpeedPrint, setEnableSpeedPrint] = useState<boolean>(true);
    const [defaultCopies, setDefaultCopies] = useState<number>(1);
    const [detecting, setDetecting] = useState(false);
    const [detectError, setDetectError] = useState(false);
    const [isTestingPrint, setIsTestingPrint] = useState(false);
    const detectInitRef = useRef(false);

    useEffect(() => {
        loadSettings();
        checkQZConnection();
        checkCertStatus();
    }, []);

    // Auto-detect IP on mount when no bridge IP is configured
    useEffect(() => {
        if (detectInitRef.current) return;
        if (bridgeIpAddress !== '') return;
        detectInitRef.current = true;
        setDetecting(true);
        printService.detectLocalIp().then(ip => {
            if (ip && bridgeIpAddress === '') {
                setBridgeIpAddress(ip);
                toast.info('Local IP detected: ' + ip);
            }
        }).finally(() => setDetecting(false));
    }, [bridgeIpAddress]);

    const loadSettings = () => {
        const registry = printService.getRegistry();
        if (registry) {
            if (registry.bridgeIpAddress) setBridgeIpAddress(registry.bridgeIpAddress);
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
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            toast.error('Setup failed: ' + msg);
        } finally {
            setInstalling(false);
            checkCertStatus();
        }
    };

    const handleDownloadScript = () => {
        window.open('/qz-setup/install-qz-cert.bat', '_blank');
        toast.info('Script downloaded! Right-click → Run as Administrator');
    };

    const handleDetectIp = async () => {
        setDetecting(true);
        setDetectError(false);
        try {
            const ip = await printService.detectLocalIp();
            if (ip) {
                setBridgeIpAddress(ip);
                setDetectError(false);
                toast.success('Detected IP: ' + ip);
            } else {
                setDetectError(true);
                toast.error('Could not detect local IP. Make sure the Bridge is running.');
            }
        } catch {
            setDetectError(true);
            toast.error('IP detection failed');
        } finally {
            setDetecting(false);
        }
    };

    const handleSave = () => {
        printService.updateRegistry({
            bridgeIpAddress, thermalPrinter, a4Printer, receiptFormat, labelPrinter,
            enableThermal, enableA4, enableSpeedPrint, defaultCopies
        });
        localStorage.setItem('casper_default_print_copies', defaultCopies.toString());
        toast.success("Printer preferences saved to this device registry");
    };

    const handleTestReceipt = async () => {
        if (isTestingPrint) return;
        const target = receiptFormat === 'a4' ? a4Printer : thermalPrinter;
        if (!target || target === 'none') return toast.error("Select a printer first");
        setIsTestingPrint(true);
        try {
            const t = toast.loading("Sending test receipt...");
            await printService.testPrint(target);
            toast.dismiss(t);
            toast.success("Test sent to " + target);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error("Print failed: " + msg);
        } finally {
            setIsTestingPrint(false);
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

    const certDisplay = getCertStatusDisplay();    return (
        <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300 pb-14">
            {/* Status & Security Top Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {/* Host Connection Status */}
                <div className={cn(
                    "glass-card backdrop-blur-xl p-3 rounded-xl border flex items-center gap-3 shadow-sm transition-all group",
                    qzStatus?.online ? "bg-emerald-500/10 border-emerald-500/30" : "bg-rose-500/10 border-rose-500/30"
                )}>
                    <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0",
                        qzStatus?.online ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                    )}>
                        {qzStatus?.online ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                            {printService.isElectron() ? "Host Connection" : "Network Target"}
                        </div>
                        <div className="text-xs font-black tracking-tight flex items-center gap-1.5 text-foreground truncate">
                            {qzStatus?.online ? (
                                 printService.isElectron() ? (
                                     <><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Native Core Enabled</>
                                 ) : (
                                     "Hardware Bridge Connected"
                                 )
                            ) : "Service Offline"}
                        </div>
                        <div className="text-[9px] font-bold text-muted-foreground/60 truncate">
                            {qzStatus?.online 
                                ? (qzStatus.version?.includes('Bridge') ? `Remote ${qzStatus.version}` : `v${qzStatus.version}`)
                                : "Physical hardware offline"}
                        </div>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={checkQZConnection} 
                        disabled={loading} 
                        className="h-8 w-8 rounded-lg bg-card/60 border border-border/40 hover:bg-card shrink-0"
                        title="Refresh connection"
                    >
                        <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
                    </Button>
                </div>

                {/* QZ Tray Security Card */}
                <div className={cn("glass-card backdrop-blur-xl p-3 rounded-xl border flex items-center gap-3 shadow-sm transition-all", certDisplay.color)}>
                    <div className="shrink-0">{certDisplay.icon}</div>
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wider">{certDisplay.label}</div>
                        <div className="text-[9px] font-medium opacity-70 truncate">{certDisplay.desc}</div>
                    </div>
                    {certStatus !== 'installed' && certStatus !== 'checking' && certStatus !== 'qz-missing' && (
                        <div className="flex gap-1 shrink-0">
                             <Button
                                size="sm"
                                onClick={handleInstallCert}
                                disabled={installing}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white font-black text-[10px] uppercase tracking-wider px-2.5 rounded-lg h-7 shadow-xs"
                            >
                                {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                                Fix
                            </Button>
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={handleDownloadScript}
                                className="border-border/40 text-foreground hover:bg-card rounded-lg h-7 w-7 transition-all"
                                title="Download script"
                            >
                                <Download className="w-3 h-3" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Printer Assignment Matrix */}
            <div className="glass-card bg-card/60 backdrop-blur-xl p-3.5 rounded-xl border border-border/40 shadow-md relative overflow-hidden space-y-3">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                        <Printer className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-tight text-foreground leading-none">
                            Hardware Telemetry & Routing
                        </h3>
                        <p className="text-[10px] font-bold text-muted-foreground/60 mt-0.5">Route POS documents to local physical devices</p>
                    </div>
                </div>

                {/* Hardware Bridge IP (Network Printing) */}
                {!printService.isElectron() && (
                    <div className="space-y-1 p-2.5 rounded-lg bg-background/40 border border-border/20">
                        <Label className="text-[10px] font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                            <Zap className="w-3 h-3 text-cyan-500" /> Hardware Bridge IP Address
                        </Label>
                        <div className="flex gap-2 items-center">
                            <input
                                type="text"
                                value={bridgeIpAddress}
                                onChange={(e) => setBridgeIpAddress(e.target.value)}
                                placeholder="e.g. 192.168.1.15"
                                className="flex-1 bg-background/60 border border-border/40 text-foreground font-bold text-xs h-8 rounded-xl px-3 focus:outline-none focus:ring-1 focus:ring-primary/30"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={handleDetectIp}
                                disabled={detecting}
                                className="h-8 w-8 rounded-xl border-border/40 shrink-0"
                                title="Detect local IP address"
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", detecting && "animate-spin")} />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Printer Selectors Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {/* Thermal Configuration */}
                    <div className="space-y-1.5 p-2.5 rounded-xl bg-background/30 border border-border/30">
                        <div className="flex items-center justify-between">
                            <Label className={cn("text-[10px] font-black uppercase tracking-wider", enableThermal ? "text-foreground" : "opacity-50")}>Thermal (80/58mm)</Label>
                            <div className="flex items-center gap-1.5">
                                <span className={cn("text-[8px] font-black uppercase", enableThermal ? "text-emerald-500" : "text-muted-foreground/50")}>{enableThermal ? 'Active' : 'Off'}</span>
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
                                <SelectTrigger className="bg-background/60 border border-border/40 text-foreground font-bold text-xs h-8 rounded-xl px-2.5 focus:ring-primary/20">
                                    <SelectValue placeholder="Select thermal target..." />
                                </SelectTrigger>
                                <SelectContent className="bg-card/95 backdrop-blur-2xl border-border/40 rounded-xl text-foreground">
                                    <SelectItem value="none" className="font-bold text-xs uppercase py-2">/ Disabled Routing</SelectItem>
                                    {printers.map(p => (
                                        <SelectItem key={p} value={p} className="font-bold text-xs py-2 rounded-lg">{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* A4 Configuration */}
                    <div className="space-y-1.5 p-2.5 rounded-xl bg-background/30 border border-border/30">
                        <div className="flex items-center justify-between">
                            <Label className={cn("text-[10px] font-black uppercase tracking-wider", enableA4 ? "text-foreground" : "opacity-50")}>A4 / Laser</Label>
                            <div className="flex items-center gap-1.5">
                                <span className={cn("text-[8px] font-black uppercase", enableA4 ? "text-sky-500" : "text-muted-foreground/50")}>{enableA4 ? 'Active' : 'Off'}</span>
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
                                <SelectTrigger className="bg-background/60 border border-border/40 text-foreground font-bold text-xs h-8 rounded-xl px-2.5 focus:ring-primary/20">
                                    <SelectValue placeholder="Select A4 destination..." />
                                </SelectTrigger>
                                <SelectContent className="bg-card/95 backdrop-blur-2xl border-border/40 rounded-xl text-foreground">
                                    <SelectItem value="none" className="font-bold text-xs uppercase py-2">/ Manual Handover</SelectItem>
                                    {printers.map(p => (
                                        <SelectItem key={p} value={p} className="font-bold text-xs py-2 rounded-lg">{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>

                    {/* Label Configuration */}
                    <div className="space-y-1.5 p-2.5 rounded-xl bg-background/30 border border-border/30">
                        <Label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Label (50x30mm)</Label>
                        <Select value={labelPrinter} onValueChange={setLabelPrinter} disabled={!qzStatus?.online}>
                            <SelectTrigger className="bg-background/60 border border-border/40 text-foreground font-bold text-xs h-8 rounded-xl px-2.5 focus:ring-primary/20">
                                <SelectValue placeholder="Select label target..." />
                            </SelectTrigger>
                            <SelectContent className="bg-card/95 backdrop-blur-2xl border-border/40 rounded-xl text-foreground">
                                <SelectItem value="none" className="font-bold text-xs uppercase py-2">/ Use OS Dialog</SelectItem>
                                {printers.map(p => (
                                    <SelectItem key={p} value={p} className="font-bold text-xs py-2 rounded-lg">{p}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Copies, Speed Print & Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/20">
                    <div className="flex items-center gap-3">
                        {/* Iteration Control */}
                        <div className="flex items-center gap-1.5 bg-background/60 border border-border/40 px-2 py-1 rounded-xl">
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 mr-1">Copies:</span>
                            <Button 
                                size="icon" 
                                variant="ghost" 
                                onClick={() => setDefaultCopies(prev => Math.max(1, prev - 1))}
                                className="w-6 h-6 rounded-lg bg-card border border-border/40 hover:text-rose-500 text-xs"
                            >
                                -
                            </Button>
                            <span className="w-5 text-center text-xs font-black text-primary font-mono">
                                {defaultCopies}
                            </span>
                            <Button 
                                size="icon" 
                                variant="ghost" 
                                onClick={() => setDefaultCopies(prev => Math.min(10, prev + 1))}
                                className="w-6 h-6 rounded-lg bg-card border border-border/40 hover:text-emerald-500 text-xs"
                            >
                                +
                            </Button>
                        </div>

                        {/* Speed Print Toggle */}
                        <div className="flex items-center gap-2 px-2.5 py-1 border border-border/40 rounded-xl bg-indigo-500/10">
                             <Label className="text-[10px] font-black uppercase tracking-wider text-foreground flex items-center gap-1">
                                <Zap className="w-2.5 h-2.5 text-indigo-400" /> Fast-Print
                             </Label>
                             <Switch
                                checked={enableSpeedPrint}
                                onCheckedChange={setEnableSpeedPrint}
                             />
                        </div>
                    </div>

                    {/* Operational Actions */}
                    <div className="flex items-center gap-2">
                        {(enableThermal || enableA4) && (
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={handleTestReceipt}
                                disabled={isTestingPrint}
                                className="h-8 px-3 rounded-xl border-border/40 text-xs font-bold gap-1.5 hover:text-primary"
                            >
                                {isTestingPrint ? <Loader2 className="w-3 h-3 animate-spin text-primary" /> : <RefreshCw className="w-3 h-3" />}
                                Test Print
                            </Button>
                        )}
                        <Button 
                            onClick={handleSave} 
                            className="bg-primary hover:bg-primary/90 px-4 h-8 rounded-xl text-white font-black text-xs uppercase tracking-wider gap-1.5 shadow-md shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            <Save className="w-3.5 h-3.5" /> Save Preferences
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
