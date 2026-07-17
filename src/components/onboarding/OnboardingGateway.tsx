"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Play, ArrowRight, KeyRound, Loader2, Sparkles, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import ActivateForm from "@/app/activate/ActivateForm";
import StaffOverrideModal from "./StaffOverrideModal";

export default function OnboardingGateway() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [showActivation, setShowActivation] = useState(false);
    const [showStaffOverride, setShowStaffOverride] = useState(false);

    // Listen for Ctrl+Shift+A for Staff Override Modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && (e.code === "KeyA" || e.key === "A" || e.key === "a" || e.key === "ش")) {
                e.preventDefault();
                setShowStaffOverride(true);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const handleStartTrial = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/license/trial", { method: "POST" });
            const data = await res.json();

            if (data.success) {
                toast.success("Trial started successfully! Redirecting to setup...");
                router.push("/setup");
            } else {
                toast.error(data.error || "Failed to start trial");
            }
        } catch (error) {
            toast.error("Network error starting trial");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 animate-in fade-in slide-in-from-top-8 duration-500">
            {/* Casper Logo & Branding */}
            <div className="flex flex-col items-center justify-center text-center mb-4 sm:mb-6 gap-2">
                <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                    <ShieldCheck className="w-8 h-8 sm:w-10 sm:h-10" />
                </div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
                    Welcome to <span className="text-cyan-400">Casper POS</span>
                </h1>
                <p className="text-slate-400 max-w-md text-xs sm:text-sm leading-snug">
                    Activate your workspace or start a trial to configure your POS terminal and hardware.
                </p>
                
                {/* Step indicator */}
                <div className="flex items-center gap-2 mt-1">
                    <span className="h-1.5 w-6 rounded-full bg-cyan-500"></span>
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-700"></span>
                    <span className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider ml-1">Step 1 of 2: Activation</span>
                </div>
            </div>

            {/* Gateway Card */}
            <Card className="glass-card bg-slate-900/40 border-slate-800/80 shadow-2xl relative overflow-hidden backdrop-blur-xl">
                {/* Background glow decoration */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -mr-40 -mt-40"></div>
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-violet-500/5 rounded-full blur-3xl pointer-events-none -ml-40 -mb-40"></div>

                <CardHeader className="text-center border-b border-slate-800/50 pb-4 relative z-10">
                    <CardTitle className="text-lg sm:text-xl text-white">Choose Onboarding Method</CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-slate-400">Select how you want to initialize this client node.</CardDescription>
                </CardHeader>
                <CardContent className="pt-4 sm:pt-6 flex flex-col gap-4 relative z-10">
                    {!showActivation ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            {/* Option A: Trial */}
                            <div className="flex flex-col p-4 rounded-xl border border-slate-800 bg-slate-950/40 hover:border-cyan-500/30 transition-all duration-300 group">
                                <div className="p-2 w-max rounded-lg bg-cyan-500/10 text-cyan-400 mb-3 group-hover:scale-110 transition-transform">
                                    <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <h3 className="text-sm sm:text-md font-bold text-white mb-1">30-Day Free Trial</h3>
                                <p className="text-[10px] sm:text-xs text-slate-400 mb-4 leading-snug flex-1">
                                    Start a fully-featured trial immediately to test printing, inventory management, and cashier features. No license key required.
                                </p>
                                <Button 
                                    onClick={handleStartTrial} 
                                    disabled={loading}
                                    size="sm"
                                    className="w-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold transition-all gap-2"
                                >
                                    {loading ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                        <>
                                            Start Trial <Play className="w-3 h-3 fill-slate-950" />
                                        </>
                                    )}
                                </Button>
                            </div>

                            {/* Option B: License */}
                            <div className="flex flex-col p-4 rounded-xl border border-slate-800 bg-slate-950/40 hover:border-violet-500/30 transition-all duration-300 group">
                                <div className="p-2 w-max rounded-lg bg-violet-500/10 text-violet-400 mb-3 group-hover:scale-110 transition-transform">
                                    <KeyRound className="w-4 h-4 sm:w-5 sm:h-5" />
                                </div>
                                <h3 className="text-sm sm:text-md font-bold text-white mb-1">Activate Client Key</h3>
                                <p className="text-[10px] sm:text-xs text-slate-400 mb-4 leading-snug flex-1">
                                    Enter a generated client key bound securely to this machine. Necessary for production cloud sync and global operations.
                                </p>
                                <Button 
                                    onClick={() => setShowActivation(true)}
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-slate-700 text-slate-200 hover:bg-slate-800 font-bold transition-all gap-2"
                                >
                                    Activate Key <ArrowRight className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {/* Return Button */}
                            <div className="flex justify-between items-center">
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    onClick={() => setShowActivation(false)}
                                    className="text-slate-400 hover:text-white h-7 px-2"
                                >
                                    ← Back Options
                                </Button>
                                <span className="text-[9px] sm:text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Production Setup</span>
                            </div>

                            {/* Reuses standard Activation form */}
                            <div className="border border-slate-800 rounded-lg bg-slate-950/20 p-2">
                                <ActivateForm />
                            </div>
                        </div>
                    )}
                    
                    {/* Support note */}
                    <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] sm:text-xs text-slate-500">
                        <HelpCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>Need help activating? Contact support: +20 100 0000 000</span>
                    </div>
                </CardContent>
            </Card>

            {/* Hidden override modal */}
            <StaffOverrideModal 
                isOpen={showStaffOverride} 
                onClose={() => setShowStaffOverride(false)} 
            />
        </div>
    );
}
