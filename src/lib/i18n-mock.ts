import ar from "../../messages/ar.json";

// Helper to get nested value from object
function getNestedValue(obj: any, path: string) {
    return path.split('.').reduce((prev, curr) => {
        return prev ? prev[curr] : undefined;
    }, obj);
}

// Mock for next-intl server-side
export async function getTranslations(namespace: string) {
    return (key: string, paramsOrFallback?: any, fallback?: string) => {
        const messages = ar as any;
        const nsObj = getNestedValue(messages, namespace);
        const result = nsObj ? getNestedValue(nsObj, key) : undefined;
        
        let actualFallback = typeof paramsOrFallback === 'string' ? paramsOrFallback : fallback;
        let actualParams = typeof paramsOrFallback === 'object' ? paramsOrFallback : undefined;

        const val = result || actualFallback || key;

        if (actualParams) {
            let text = val;
            Object.entries(actualParams).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
            return text;
        }
        return val;
    };
}

// Mock for next-intl client-side
export function useTranslations(namespace: string) {
    return (key: string, paramsOrFallback?: any, fallback?: string) => {
        const messages = ar as any;
        const nsObj = getNestedValue(messages, namespace);
        const result = nsObj ? getNestedValue(nsObj, key) : undefined;

        let actualFallback = typeof paramsOrFallback === 'string' ? paramsOrFallback : fallback;
        let actualParams = typeof paramsOrFallback === 'object' ? paramsOrFallback : undefined;

        const val = result || actualFallback || key;

        if (actualParams) {
            let text = val;
            Object.entries(actualParams).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
            return text;
        }
        return val;
    };
}

export function useLocale(): "en" | "ar" {
    return "ar";
}

export function useDirection() {
    return "rtl";
}
