import { cn } from "@/lib/utils";

/**
 * CasperLogo - The OFFICIAL unified logo component.
 * Uses 'casper-light.png' as the only source for all themes.
 * Displays with a forced premium circular background.
 */
export function CasperLogo({ className, width = 64, height = 64 }: { 
    className?: string, 
    width?: number, 
    height?: number
}) {
    return (
        <div 
            className={cn(
                "flex items-center justify-center overflow-hidden transition-all duration-300", 
                "bg-background dark:bg-[#222222] shadow-xl",
                className
            )} 
            style={{ 
                width: `${width}px`, 
                height: `${height}px`,
                minWidth: `${width}px`,
                minHeight: `${height}px`,
                borderRadius: "9999px",
                border: "2px solid rgba(0,0,0,0.05)",
                transition: "width 300ms ease, height 300ms ease, min-width 300ms ease, min-height 300ms ease"
            }}
        >
            <div className="relative flex items-center justify-center" style={{ width: "85%", height: "85%" }}>
                {/* Unified Official Logo - casper-main.png */}
                <img 
                    src="/assets/casper-light.png" 
                    alt="Casper ERP" 
                    className="w-full h-full object-contain"
                />
            </div>
        </div>
    );
}
