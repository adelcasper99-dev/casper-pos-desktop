"use client";

import { memo } from "react";
import { useState, useEffect } from "react";
import { User, LogOut, CalendarDays } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { logout } from "@/actions/auth";
import { cn } from "@/lib/utils";

interface StaffProfileBadgeProps {
    user: {
        username: string;
        name?: string | null;
        role?: string;
        branchName?: string;
    }
    isExpanded: boolean;
}

function StaffProfileBadge({ user, isExpanded }: StaffProfileBadgeProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [currentDate, setCurrentDate] = useState("");

    useEffect(() => {
        setCurrentDate(new Date().toLocaleDateString());
    }, []);

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <div
                    className={cn(
                        "rounded-xl bg-card border border-border p-2 flex items-center gap-3 transition-all duration-300 overflow-hidden cursor-pointer hover:bg-muted/50 group relative",
                        isExpanded ? "justify-between" : "justify-center"
                    )}
                    suppressHydrationWarning
                    title="Click for Staff Profile"
                >
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg border border-white/10 text-xs font-bold text-white">
                                {user?.username ? user.username.substring(0, 2).toUpperCase() : '??'}
                            </div>
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card bg-green-500" />
                        </div>

                        <div className={cn("flex flex-col transition-opacity duration-200 min-w-0 text-left", isExpanded ? "opacity-100" : "opacity-0 w-0")}>
                            <span className="text-xs font-bold text-white truncate">{user?.name || user?.username || 'Guest'}</span>
                            <span className="text-[10px] text-cyan-400 truncate">{user?.role || "Staff"}</span>
                            {user?.branchName && (
                                <span className="text-[9px] text-zinc-500 truncate uppercase tracking-wider">{user.branchName}</span>
                            )}
                        </div>
                    </div>

                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            logout();
                        }}
                        className={cn(
                            "p-2 rounded-lg hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors shrink-0 z-10",
                            !isExpanded && "hidden group-hover:block absolute right-0 bg-black/80 backdrop-blur-md"
                        )}
                        title="Logout"
                    >
                        <LogOut className="w-4 h-4" />
                    </div>
                </div>
            </DialogTrigger>

            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <User className="w-5 h-5 text-cyan-400" />
                        Staff Profile
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center py-4 space-y-4">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl font-bold text-white shadow-2xl">
                            {user?.username ? user.username.substring(0, 2).toUpperCase() : '??'}
                        </div>
                        <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full border-4 border-background bg-green-500" />
                    </div>

                    <div className="text-center space-y-1">
                        <h3 className="font-bold text-xl">{user?.name || user?.username || 'Guest'}</h3>
                        <p className="text-sm text-cyan-400 font-medium">{user?.role}</p>
                        <p className="text-xs text-muted-foreground">{user?.branchName || "Main Branch"}</p>
                    </div>

                    <Separator />

                    <div className="bg-green-500/10 text-green-500 p-3 rounded-xl w-full text-center">
                        <p className="text-sm font-bold">Attendance: Present (Auto)</p>
                        <p className="text-xs opacity-70">System tracks attendance automatically.</p>
                    </div>

                    <div className="w-full pt-2">
                        <Button
                            className="w-full h-12 text-lg font-bold bg-zinc-800 hover:bg-zinc-700 hover:text-red-400 border-zinc-700"
                            variant="outline"
                            onClick={() => logout()}
                        >
                            <LogOut className="mr-2 h-5 w-5" />
                            LOGOUT
                        </Button>
                    </div>
                </div>

                <div className="bg-muted/30 -mx-6 -mb-6 p-4 mt-2 border-t flex justify-between items-center text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {currentDate}</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default memo(StaffProfileBadge);
