"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calculator, Package, ShoppingCart } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock";

export default function Dashboard() {
    const t = useTranslations('Dashboard');

    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/pos">
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer border-cyan-500/20">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-cyan-500">
                                <Calculator className="h-6 w-6" />
                                {t('pos')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {t('posDesc')}
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/inventory">
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Package className="h-6 w-6" />
                                {t('inventory')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {t('inventoryDesc')}
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/purchasing">
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShoppingCart className="h-6 w-6" />
                                {t('purchasing')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {t('purchasingDesc')}
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
