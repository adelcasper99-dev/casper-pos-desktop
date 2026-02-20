"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

type ActionResponse<T> = {
    success: boolean;
    data?: T;
    error?: string;
};

type UseServerActionOptions<T> = {
    onSuccess?: (data: T) => void;
    onError?: (error: string) => void;
    successMessage?: string;
    errorMessage?: string; // Default override
};

export function useServerAction<T, A extends any[]>(
    action: (...args: A) => Promise<ActionResponse<T>>,
    options: UseServerActionOptions<T> = {}
) {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<ActionResponse<T> | null>(null);

    const execute = (...args: A) => {
        startTransition(async () => {
            try {
                const res = await action(...args);
                setResult(res);

                if (res.success) {
                    if (options.successMessage) {
                        toast.success(options.successMessage);
                    }
                    if (options.onSuccess && res.data !== undefined) {
                        options.onSuccess(res.data);
                    }
                } else {
                    const msg = res.error || options.errorMessage || "An error occurred";
                    toast.error(msg);
                    if (options.onError) {
                        options.onError(msg);
                    }
                }
            } catch (err: any) {
                console.error("Action Execution Error", err);
                const msg = options.errorMessage || "Unexpected error";
                toast.error(msg);
                if (options.onError) {
                    options.onError(msg);
                }
            }
        });
    };

    return { execute, isPending, result };
}
