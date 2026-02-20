/**
 * Label Template Presets Library
 * Pre-configured, tested templates to minimize errors
 */

import type { LabelTemplate } from './label-commands';

export const TEMPLATE_PRESETS: Record<string, LabelTemplate> = {
    // 1. MINIMAL - Just barcode (like your screenshot)
    minimal: {
        dimensions: { width: 50, height: 30 },
        page: { width: 50, height: 30 },
        margin: { top: 2, right: 2, bottom: 2, left: 2 },
        elements: [
            {
                id: 'barcode',
                label: 'Barcode',
                type: 'barcode',
                x: 10,
                y: 10,
                visible: true,
                rotation: 0,
                width: 30,
                height: 10
            }
        ]
    },

    // 2. STANDARD - Most common layout (barcode + price + name)
    standard: {
        dimensions: { width: 50, height: 30 },
        page: { width: 50, height: 30 },
        margin: { top: 2, right: 2, bottom: 2, left: 2 },
        elements: [
            {
                id: 'storeName',
                label: 'My Store',
                type: 'text',
                x: 2,
                y: 2,
                fontSize: 8,
                fontWeight: 'normal',
                visible: true,
                rotation: 0
            },
            {
                id: 'barcode',
                label: '12345678',
                type: 'barcode',
                x: 8,
                y: 8,
                visible: true,
                rotation: 0,
                width: 34,
                height: 8
            },
            {
                id: 'productName',
                label: 'Product Name',
                type: 'text',
                x: 2,
                y: 18,
                fontSize: 9,
                fontWeight: 'bold',
                visible: true,
                rotation: 0,
                sampleData: 'Product Name',
                width: 46
            },
            {
                id: 'price',
                label: 'Price',
                type: 'text',
                x: 15,
                y: 25,
                fontSize: 11,
                fontWeight: 'bold',
                visible: true,
                rotation: 0,
                sampleData: '$99.99',
                width: 20
            }
        ]
    },

    // 3. COMPACT - Small text, maximum info
    compact: {
        dimensions: { width: 50, height: 30 },
        page: { width: 50, height: 30 },
        margin: { top: 1, right: 1, bottom: 1, left: 1 },
        elements: [
            {
                id: 'sku',
                label: 'SKU',
                type: 'text',
                x: 2,
                y: 1,
                fontSize: 7,
                fontWeight: 'normal',
                visible: true,
                rotation: 0,
                sampleData: 'SKU-12345'
            },
            {
                id: 'barcode',
                label: 'Barcode',
                type: 'barcode',
                x: 6,
                y: 6,
                visible: true,
                rotation: 0,
                width: 38,
                height: 7
            },
            {
                id: 'productName',
                label: 'Product Name',
                type: 'text',
                x: 2,
                y: 15,
                fontSize: 8,
                fontWeight: 'bold',
                visible: true,
                rotation: 0,
                sampleData: 'Product',
                width: 46
            },
            {
                id: 'price',
                label: 'Price',
                type: 'text',
                x: 2,
                y: 22,
                fontSize: 10,
                fontWeight: 'bold',
                visible: true,
                rotation: 0,
                sampleData: '$99.99',
                width: 20
            },
            {
                id: 'date',
                label: 'Date',
                type: 'text',
                x: 30,
                y: 23,
                fontSize: 6,
                fontWeight: 'normal',
                visible: true,
                rotation: 0,
                sampleData: '2026-01-18'
            }
        ]
    },

    // 4. LARGE PRICE - Emphasis on price
    largeprice: {
        dimensions: { width: 50, height: 30 },
        page: { width: 50, height: 30 },
        margin: { top: 2, right: 2, bottom: 2, left: 2 },
        elements: [
            {
                id: 'barcode',
                label: 'Barcode',
                type: 'barcode',
                x: 8,
                y: 3,
                visible: true,
                rotation: 0,
                width: 34,
                height: 7
            },
            {
                id: 'productName',
                label: 'Product Name',
                type: 'text',
                x: 2,
                y: 12,
                fontSize: 8,
                fontWeight: 'normal',
                visible: true,
                rotation: 0,
                sampleData: 'Product Name',
                width: 46
            },
            {
                id: 'price',
                label: 'Price',
                type: 'text',
                x: 10,
                y: 20,
                fontSize: 14,
                fontWeight: 'bold',
                visible: true,
                rotation: 0,
                sampleData: '$99.99',
                width: 30
            }
        ]
    },

    // 5. ROTATED - Vertical orientation
    rotated: {
        dimensions: { width: 50, height: 30 },
        page: { width: 50, height: 30 },
        margin: { top: 2, right: 2, bottom: 2, left: 2 },
        elements: [
            {
                id: 'sku',
                label: 'SKU',
                type: 'text',
                x: 2,
                y: 15,
                fontSize: 8,
                fontWeight: 'bold',
                visible: true,
                rotation: 90,
                sampleData: 'SKU-12345'
            },
            {
                id: 'barcode',
                label: 'Barcode',
                type: 'barcode',
                x: 15,
                y: 5,
                visible: true,
                rotation: 0,
                width: 25,
                height: 8
            },
            {
                id: 'price',
                label: 'Price',
                type: 'text',
                x: 42,
                y: 15,
                fontSize: 10,
                fontWeight: 'bold',
                visible: true,
                rotation: 90,
                sampleData: '$99.99'
            }
        ]
    },

    // 6. RETAIL - Full retail info
    retail: {
        dimensions: { width: 50, height: 30 },
        page: { width: 50, height: 30 },
        margin: { top: 2, right: 2, bottom: 2, left: 2 },
        elements: [
            {
                id: 'storeName',
                label: 'Store Name',
                type: 'text',
                x: 15,
                y: 2,
                fontSize: 7,
                fontWeight: 'bold',
                visible: true,
                rotation: 0,
                sampleData: 'CASPER POS'
            },
            {
                id: 'sku',
                label: 'SKU',
                type: 'text',
                x: 2,
                y: 8,
                fontSize: 6,
                fontWeight: 'normal',
                visible: true,
                rotation: 0,
                sampleData: 'SKU: 12345'
            },
            {
                id: 'barcode',
                label: 'Barcode',
                type: 'barcode',
                x: 8,
                y: 11,
                visible: true,
                rotation: 0,
                width: 34,
                height: 7
            },
            {
                id: 'productName',
                label: 'Product Name',
                type: 'text',
                x: 2,
                y: 20,
                fontSize: 8,
                fontWeight: 'bold',
                visible: true,
                rotation: 0,
                sampleData: 'Product Name',
                width: 46
            },
            {
                id: 'price',
                label: 'Price',
                type: 'text',
                x: 18,
                y: 26,
                fontSize: 10,
                fontWeight: 'bold',
                visible: true,
                rotation: 0,
                sampleData: '$99.99'
            }
        ]
    }
};

// Template metadata for UI display
export const TEMPLATE_INFO = {
    minimal: {
        name: 'Minimal',
        description: 'Barcode only - simplest layout',
        icon: '📊',
        bestFor: 'Quick labeling, warehouse use'
    },
    standard: {
        name: 'Standard',
        description: 'Barcode + price + name',
        icon: '⭐',
        bestFor: 'Most retail products'
    },
    compact: {
        name: 'Compact',
        description: 'Maximum info in small space',
        icon: '📦',
        bestFor: 'Small items, detailed info needed'
    },
    largeprice: {
        name: 'Large Price',
        description: 'Emphasis on pricing',
        icon: '💰',
        bestFor: 'Price-focused sales, promotions'
    },
    rotated: {
        name: 'Rotated',
        description: 'Vertical orientation',
        icon: '🔄',
        bestFor: 'Shelving edge labels'
    },
    retail: {
        name: 'Retail Complete',
        description: 'Full retail information',
        icon: '🏪',
        bestFor: 'Professional retail stores'
    }
};

// Validate template structure
export function validateTemplate(template: LabelTemplate): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    if (!template.dimensions) {
        errors.push('Missing dimensions');
    } else {
        if (template.dimensions.width <= 0 || template.dimensions.width > 100) {
            errors.push('Invalid width (must be 0-100mm)');
        }
        if (template.dimensions.height <= 0 || template.dimensions.height > 100) {
            errors.push('Invalid height (must be 0-100mm)');
        }
    }

    if (!template.elements || !Array.isArray(template.elements)) {
        errors.push('Missing or invalid elements array');
    } else {
        // Validate each element
        template.elements.forEach((el, idx) => {
            if (!el.id) errors.push(`Element ${idx}: missing id`);
            if (!el.type) errors.push(`Element ${idx}: missing type`);
            if (typeof el.x !== 'number') errors.push(`Element ${idx}: invalid x position`);
            if (typeof el.y !== 'number') errors.push(`Element ${idx}: invalid y position`);
            if (typeof el.visible !== 'boolean') errors.push(`Element ${idx}: missing visibility`);

            // Check bounds
            if (template.dimensions) {
                if (el.x < 0 || el.x > template.dimensions.width) {
                    errors.push(`Element ${idx} (${el.id}): x position out of bounds`);
                }
                if (el.y < 0 || el.y > template.dimensions.height) {
                    errors.push(`Element ${idx} (${el.id}): y position out of bounds`);
                }
            }
        });
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// Get template safely with validation
export function getTemplate(presetName: string): LabelTemplate | null {
    const template = TEMPLATE_PRESETS[presetName];
    if (!template) return null;

    const validation = validateTemplate(template);
    if (!validation.valid) {
        console.error(`Template ${presetName} validation failed:`, validation.errors);
        return null;
    }

    return template;
}

// List all available templates
export function listTemplates() {
    return Object.keys(TEMPLATE_PRESETS).map(key => ({
        id: key,
        ...TEMPLATE_INFO[key as keyof typeof TEMPLATE_INFO],
        template: TEMPLATE_PRESETS[key]
    }));
}
