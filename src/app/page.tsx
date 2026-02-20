import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calculator, Package, ShoppingCart } from "lucide-react";

export default function Dashboard() {
    return (
        <div className="p-8">
            <h1 className="text-3xl font-bold mb-8">Casper POS Desktop</h1>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/pos">
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calculator className="h-6 w-6" />
                                POS
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            Start selling and manage shifts.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/inventory">
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Package className="h-6 w-6" />
                                Inventory
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            Manage products and stock.
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/purchasing">
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShoppingCart className="h-6 w-6" />
                                Purchasing
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            Create purchase orders.
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
