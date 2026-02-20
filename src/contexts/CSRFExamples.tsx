/**
 * Example: How to use the CSRF Context in your components
 * 
 * This file demonstrates the new pattern for accessing CSRF tokens
 * without prop drilling.
 */

'use client';

import { useCSRF } from '@/contexts/CSRFContext';
import { deleteSupplier } from '@/actions/inventory';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Example Component: Delete Button with CSRF
 * 
 * BEFORE (Prop Drilling):
 * ```tsx
 * function DeleteButton({ supplierId, csrfToken }: { supplierId: string; csrfToken: string }) {
 *   const handleDelete = async () => {
 *     const result = await deleteSupplier({ id: supplierId, csrfToken });
 *     if (result.success) toast.success('Deleted');
 *   };
 *   return <button onClick={handleDelete}>Delete</button>;
 * }
 * ```
 * 
 * AFTER (Context Hook):
 * ```tsx
 * function DeleteButton({ supplierId }: { supplierId: string }) {
 *   const { token } = useCSRF();
 *   const handleDelete = async () => {
 *     const result = await deleteSupplier({ id: supplierId, csrfToken: token! });
 *     if (result.success) toast.success('Deleted');
 *   };
 *   return <button onClick={handleDelete}>Delete</button>;
 * }
 * ```
 */
export function ExampleDeleteButton({ supplierId }: { supplierId: string }) {
    const { token, isLoading, refresh } = useCSRF();
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        // Show loading state if token isn't ready yet
        if (isLoading || !token) {
            toast.error('Please wait, loading security token...');
            return;
        }

        try {
            setDeleting(true);

            const result = await deleteSupplier({
                id: supplierId,
                csrfToken: token
            });

            if (result.success) {
                toast.success('Supplier deleted successfully');
            } else {
                // If CSRF token expired, refresh and retry
                if (result.error?.includes('security token')) {
                    toast.info('Token expired, retrying...');
                    await refresh();
                    // Retry after refresh
                    const retryResult = await deleteSupplier({
                        id: supplierId,
                        csrfToken: token
                    });
                    if (retryResult.success) {
                        toast.success('Supplier deleted successfully');
                    } else {
                        toast.error(retryResult.error || 'Failed to delete');
                    }
                } else {
                    toast.error(result.error || 'Failed to delete supplier');
                }
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
            console.error('Delete error:', error);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <button
            onClick={handleDelete}
            disabled={deleting || isLoading}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
        >
            {deleting ? 'Deleting...' : isLoading ? 'Loading...' : 'Delete'}
        </button>
    );
}

/**
 * Example: Form with CSRF Token
 */
export function ExampleFormWithCSRF() {
    const { token, isLoading } = useCSRF();

    const handleSubmit = async (formData: FormData) => {
        if (!token) {
            toast.error('Security token not available');
            return;
        }

        // Add CSRF token to form data
        formData.append('csrfToken', token);

        // Call your server action
        // const result = await someAction(formData);
    };

    if (isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <form action={handleSubmit}>
            {/* No need for hidden input anymore! Token is in context */}
            <input type="text" name="name" placeholder="Name" />
            <button type="submit">Submit</button>
        </form>
    );
}

/**
 * Debug Component: Display CSRF Token Status
 * Add this to your layout during development to monitor token state
 */
export function CSRFDebug() {
    const { token, isLoading, error } = useCSRF();

    if (process.env.NODE_ENV !== 'development') {
        return null;
    }

    return (
        <div className="fixed bottom-4 right-4 bg-black text-white p-4 rounded-lg shadow-lg z-50 text-xs font-mono">
            <div className="font-bold mb-2">🔐 CSRF Debug</div>
            <div>
                Status: {isLoading ? '🔄 Loading' : token ? '✅ Ready' : '❌ No Token'}
            </div>
            {token && (
                <div className="mt-1">
                    Token: {token.substring(0, 12)}...
                </div>
            )}
            {error && (
                <div className="mt-1 text-red-400">
                    Error: {error}
                </div>
            )}
        </div>
    );
}
