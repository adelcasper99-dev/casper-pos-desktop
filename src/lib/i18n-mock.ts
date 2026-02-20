// Mock for next-intl server-side
export async function getTranslations(namespace: string) {
    return (key: string, params?: Record<string, string | number>) => {
        if (params) {
            let text = key.split('.').pop() || key;
            Object.entries(params).forEach(([k, v]) => {
                text += ` (${k}=${v})`;
            });
            return text;
        }
        const parts = key.split('.');
        return parts[parts.length - 1].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };
}

// Mock for next-intl client-side
export function useTranslations(namespace: string) {
    return (key: string, params?: Record<string, string | number>) => {
        if (params) {
            let text = key.split('.').pop() || key;
            Object.entries(params).forEach(([k, v]) => {
                text += ` (${k}=${v})`;
            });
            return text;
        }
        const parts = key.split('.');
        return parts[parts.length - 1].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };
}
