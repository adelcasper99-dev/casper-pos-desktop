import Image from "next/image";
import { cn } from "@/lib/utils";

interface CasperLoaderProps {
  className?: string;
  width?: number;
  height?: number; // Kept for API compatibility, but effectively square based on width
  text?: string;
}

export function CasperLoader({ className, width = 60, height, text }: CasperLoaderProps) {
  // Use width as size
  const size = width;
  const ghostSize = size * 0.4; // Ghosts are ~40% of container

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        className="relative animate-[spin_3s_linear_infinite]"
        style={{ width: size, height: size }}
      >
        {/* Ghost 1 - Top Center */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2">
          <Image
            src="/assets/casper-logo.png"
            alt=""
            width={ghostSize}
            height={ghostSize}
            className="drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
          />
        </div>
        {/* Ghost 2 - Bottom Right */}
        <div className="absolute bottom-[15%] right-0 rotate-[120deg] origin-center">
          <Image
            src="/assets/casper-logo.png"
            alt=""
            width={ghostSize}
            height={ghostSize}
            className="drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
          />
        </div>
        {/* Ghost 3 - Bottom Left */}
        <div className="absolute bottom-[15%] left-0 -rotate-[120deg] origin-center">
          <Image
            src="/assets/casper-logo.png"
            alt=""
            width={ghostSize}
            height={ghostSize}
            className="drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]"
          />
        </div>
      </div>

      {text && (
        <p className="text-xs text-cyan-400/80 font-medium animate-pulse tracking-widest uppercase mt-2">
          {text}
        </p>
      )}
    </div>
  );
}
