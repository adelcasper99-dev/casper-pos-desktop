"use client";

import React, { useState, useEffect } from "react";
import { Copy, Check, Smartphone, Monitor, Wifi, Globe } from "lucide-react";
import GlassModal from "@/components/ui/GlassModal";
import { Button } from "@/components/ui/button";

interface NetworkGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NetworkGuideModal({ isOpen, onClose }: NetworkGuideModalProps) {
    const [ipLink, setIpLink] = useState<string>("جاري تحميل الرابط...");
    const [copied, setCopied] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setCopied(false);
            setIsLoading(true);
            fetch("/api/network/ip")
                .then(res => res.json())
                .then(data => {
                    const port = window.location.port ? `:${window.location.port}` : '';
                    setIpLink(`http://${data.ip}${port}`);
                })
                .catch(() => {
                    setIpLink("فشل في استخراج الرابط");
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [isOpen]);

    const handleCopy = () => {
        if (ipLink.startsWith("http")) {
            navigator.clipboard.writeText(ipLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <GlassModal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-cyan-400" />
                    <span>الوصول عبر الشبكة المحلية (LAN)</span>
                </div>
            }
            className="max-w-md"
        >
            <div className="space-y-6 pt-4 text-right" dir="rtl">
                
                <div className="bg-black/20 border border-white/5 p-4 rounded-xl">
                    <p className="text-zinc-300 text-sm leading-relaxed mb-4">
                        يمكنك فتح نظام <span className="font-bold text-white">Casper POS</span> من أي جهاز آخر (آيباد، هاتف، كمبيوتر) متصل بنفس شبكة الواي فاي. فقط قم بكتابة الرابط التالي في المتصفح الخاص بالجهاز الآخر:
                    </p>

                    <div className="flex bg-black/40 border border-cyan-500/30 rounded-lg p-1 items-stretch group relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        
                        <div className="flex-1 flex items-center justify-center py-3 px-4 font-mono text-cyan-400 font-bold tracking-wider relative z-10 select-all">
                            {isLoading ? (
                                <span className="animate-pulse text-zinc-500 text-sm">جاري الفحص...</span>
                            ) : (
                                ipLink
                            )}
                        </div>
                        
                        <Button 
                            variant="ghost" 
                            className="shrink-0 h-auto px-4 hover:bg-cyan-500/20 text-cyan-400 hover:text-cyan-300 relative z-10"
                            onClick={handleCopy}
                            disabled={isLoading || !ipLink.startsWith("http")}
                        >
                            {copied ? (
                                <Check className="w-5 h-5" />
                            ) : (
                                <Copy className="w-5 h-5" />
                            )}
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                        <div className="bg-cyan-500/20 p-2 rounded-lg">
                            <Wifi className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-xs font-bold text-white">نفس الشبكة</h4>
                            <p className="text-[10px] text-zinc-400 mt-0.5">تأكد من الاتصال بنفس الواي فاي</p>
                        </div>
                    </div>
                    
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                        <div className="bg-emerald-500/20 p-2 rounded-lg">
                            <Smartphone className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="flex-1">
                            <h4 className="text-xs font-bold text-white">أي متصفح</h4>
                            <p className="text-[10px] text-zinc-400 mt-0.5">سفاري، كروم، إيدج</p>
                        </div>
                    </div>
                </div>

            </div>
        </GlassModal>
    );
}
