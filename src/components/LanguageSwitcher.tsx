'use client';

import { useTranslations, useLocale } from '@/lib/i18n-mock';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
    compact?: boolean;
    className?: string;
}

export default function LanguageSwitcher({ compact = false, className }: LanguageSwitcherProps) {
    const router = useRouter();
    const pathname = usePathname();

    const locale: string = useLocale();

    const toggleLanguage = () => {
        const nextLocale = locale === 'ar' ? 'en' : 'ar';
        console.log(`Switching to ${nextLocale}`);
        router.refresh();
    };

    return (
        <button
            type="button"
            onClick={toggleLanguage}
            title={locale === 'ar' ? 'English' : 'العربية'}
            className={cn(
                "flex items-center justify-center gap-1 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 shrink-0",
                compact ? "h-7 px-1.5 text-[10px] font-black" : "h-8 px-2.5 text-xs font-bold",
                className
            )}
        >
            <Globe className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
            <span className="uppercase tracking-wider font-mono">
                {locale === 'ar' ? 'EN' : 'AR'}
            </span>
        </button>
    );
}
