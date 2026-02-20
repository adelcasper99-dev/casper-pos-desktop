'use client';

import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./button";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useTranslations } from "@/lib/i18n-mock"; // Added import for useTranslations

interface ErrorBoundaryProps {
    children?: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error?: Error;
}

// Internal class component to handle errors, receives 't' from the wrapper
class _ErrorBoundary extends Component<ErrorBoundaryProps & { t: ReturnType<typeof useTranslations> }, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: undefined });
        window.location.reload(); // Force reload to clear state
    };

    public render() {
        const { t } = this.props; // Destructure t from props

        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }
            return (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-6 text-center border border-red-500/20 bg-red-500/5 rounded-xl animate-in fade-in zoom-in-95 duration-300">
                    <div className="bg-red-500/10 p-4 rounded-full mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-red-200 mb-2">{t('somethingWentWrong')}</h2>
                    <p className="text-sm text-red-200/60 max-w-sm mb-6">
                        An unexpected error occurred in this component. We've logged the issue.
                    </p>

                    {/* Debug Info (Only for Dev in real app, but useful here) */}
                    <div className="text-[10px] font-mono bg-black/50 p-2 rounded text-red-400 mb-6 max-w-md overflow-hidden text-ellipsis whitespace-nowrap">
                        {this.state.error?.message}
                    </div>

                    <Button
                        onClick={this.handleReset}
                        variant="outline"
                        className="border-red-500/20 hover:bg-red-500/10 text-red-200 hover:text-white gap-2"
                    >
                        <RefreshCcw className="w-4 h-4" />
                        {t('tryAgain')}
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}

// Wrapper component to provide translations to the class component
export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
    const t = useTranslations('Errors');
    return <_ErrorBoundary t={t} fallback={fallback}>{children}</_ErrorBoundary>;
}
