import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function UnauthorizedPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center animate-fade-in">
            <div className="p-6 bg-red-500/10 rounded-full mb-6">
                <AlertCircle className="w-16 h-16 text-red-500" />
            </div>
            <h1 className="text-4xl font-bold mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-8 max-w-md">
                You do not have permission to view this page. Please contact your administrator if you believe this is a mistake.
            </p>
            <div className="flex gap-4">
                <Link
                    href="/dashboard"
                    className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-90 transition-opacity"
                >
                    Return to Dashboard
                </Link>
                <Link
                    href="/"
                    className="px-6 py-3 rounded-xl bg-muted text-muted-foreground font-bold hover:bg-muted/80 transition-colors"
                >
                    Login Page
                </Link>
            </div>
        </div>
    );
}
