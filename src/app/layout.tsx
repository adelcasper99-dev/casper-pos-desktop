import { Inter } from "next/font/google";
import "@/app/globals.css";
import { Toaster } from "@/components/ui/sonner";
import Providers from "@/components/Providers";
import Sidebar from "@/components/Sidebar";
import { getCurrentUser } from "@/actions/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
    title: "Casper POS Desktop",
    description: "Offline POS System",
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();

    return (
        <html lang="ar" dir="rtl" suppressHydrationWarning>
            <body className={inter.className}>
                <Providers>
                    <LayoutWrapper user={user}>
                        {children}
                    </LayoutWrapper>
                    <Toaster />
                </Providers>
            </body>
        </html>
    );
}

// Client-side wrapper to handle conditional sidebar
import LayoutContent from "./LayoutContent";

function LayoutWrapper({ children, user }: { children: React.ReactNode, user: any }) {
    return (
        <LayoutContent user={user}>
            {children}
        </LayoutContent>
    );
}
