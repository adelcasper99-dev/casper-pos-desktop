'use client';

import { useTranslations, useLocale } from '@/lib/i18n-mock';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

export default function LanguageSwitcher() {
    const router = useRouter();
    const pathname = usePathname();

    const locale: string = useLocale();

    const toggleLanguage = () => {
        const nextLocale = locale === 'ar' ? 'en' : 'ar';
        // Mock: just refresh or do nothing if no backend support for locale switching yet
        console.log(`Switching to ${nextLocale}`);
        router.refresh();
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={toggleLanguage}
            className="flex-1 justify-center gap-2 text-muted-foreground hover:text-foreground h-9 bg-muted/50 hover:bg-muted"
        >
            <Globe className="w-4 h-4" />
            <span className="text-xs font-bold uppercase">
                {locale === 'ar' ? 'EN' : 'AR'}
            </span>
        </Button>
    );
}
