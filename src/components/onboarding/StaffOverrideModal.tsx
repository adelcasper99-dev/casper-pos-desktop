"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldAlert, Copy, Check, Loader2, Clock, Phone } from "lucide-react";
import { toast } from "sonner";

interface StaffOverrideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// Zero-dependency client-side SHA256 helper using Web Crypto API
async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function StaffOverrideModal({ isOpen, onClose }: StaffOverrideModalProps) {
    const router = useRouter();
    const [machineId, setMachineId] = useState<string | null>(null);
    const [challengeCode, setChallengeCode] = useState<string>("");
    const [responseCode, setResponseCode] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes in seconds

    // Fetch Machine ID
    useEffect(() => {
        if (isOpen) {
            if (window.electronAPI?.license?.getMachineId) {
                window.electronAPI.license.getMachineId()
                    .then(id => setMachineId(id))
                    .catch(() => setMachineId("WEB-FALLBACK-DEV"));
            } else {
                setMachineId("WEB-FALLBACK-DEV");
            }
        }
    }, [isOpen]);

    // Calculate Challenge Code and Handle Timer
    useEffect(() => {
        if (!isOpen || !machineId) return;

        let active = true;

        const updateChallenge = async () => {
            const timeBucket = Math.floor(Date.now() / 300000); // 5 min buckets
            const rawMessage = `${machineId}_${timeBucket}`;
            const hash = await sha256(rawMessage);
            const formatted = (hash.substring(0, 4) + "-" + hash.substring(4, 8)).toUpperCase();
            if (active) {
                setChallengeCode(formatted);
            }
        };

        updateChallenge();

        // Timer countdown
        const interval = setInterval(() => {
            const nowSeconds = Math.floor(Date.now() / 1000);
            const remaining = 300 - (nowSeconds % 300);
            setTimeLeft(remaining);

            if (remaining === 300) {
                // Time bucket rolled over, regenerate challenge
                updateChallenge();
            }
        }, 1000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [isOpen, machineId]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    };

    const handleCopy = () => {
        if (!challengeCode) return;
        navigator.clipboard.writeText(challengeCode);
        setCopied(true);
        toast.success("Challenge code copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!responseCode || !machineId || !challengeCode) return;

        setLoading(true);
        try {
            const res = await fetch("/api/license/staff-verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    responseCode: responseCode.trim(),
                    machineId,
                    challenge: challengeCode
                })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                toast.success("Staff authorization granted! System unlocked.");
                onClose();
                router.push("/setup");
            } else {
                toast.error(data.error || "Override verification failed.");
            }
        } catch (error) {
            toast.error("Network error during override verification.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-rose-500 font-black">
                        <ShieldAlert className="w-5 h-5 animate-pulse" />
                        STAFF OVERRIDE MODE
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 text-xs">
                        Technician authorization required. Provide the challenge code to the central administrator to obtain an activation token.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex flex-col gap-4 py-4">
                    {/* Challenge Block */}
                    <div className="flex flex-col gap-2 p-4 rounded-xl border border-slate-800 bg-slate-950/50">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Challenge Code</span>
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-2xl font-mono font-black tracking-widest text-cyan-400">
                                {challengeCode || "GENERATING..."}
                            </span>
                            <Button 
                                size="sm" 
                                variant="outline" 
                                className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-200"
                                onClick={handleCopy}
                            >
                                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                            <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
                            <span>Code expires in: <span className="font-bold text-white">{formatTime(timeLeft)}</span></span>
                        </div>
                    </div>

                    {/* Verification Form */}
                    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Response Key</label>
                            <Input 
                                placeholder="Paste response token here..." 
                                value={responseCode}
                                onChange={(e) => setResponseCode(e.target.value)}
                                className="bg-slate-950 border-slate-800 text-white font-mono placeholder:text-slate-700 text-sm focus:border-cyan-500"
                                disabled={loading}
                            />
                        </div>
                        <Button 
                            type="submit" 
                            disabled={loading || !responseCode.trim()} 
                            className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2 mt-2"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                "Apply Override"
                            )}
                        </Button>
                    </form>
                </div>

                <div className="flex items-center justify-center gap-2 border-t border-slate-800/80 pt-4 text-xs text-slate-500">
                    <Phone className="w-3.5 h-3.5" />
                    <span>Support Desk: +20 100 0000 000</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}
