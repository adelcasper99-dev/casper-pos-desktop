export const UNIT_CATEGORIES = {
    WEIGHT: 'WEIGHT',
    VOLUME: 'VOLUME',
    COUNT: 'COUNT',
    LENGTH: 'LENGTH',
    AREA: 'AREA',
} as const;

export type UnitCategory = typeof UNIT_CATEGORIES[keyof typeof UNIT_CATEGORIES];

export interface DefaultUnit {
    name: string;
    code: string;
    category: UnitCategory;
    abbreviation: string;
    conversionFactor: number;
}

export const DEFAULT_UNITS: DefaultUnit[] = [
    // WEIGHT
    { name: 'Kilogram', code: 'kg', category: UNIT_CATEGORIES.WEIGHT, abbreviation: 'kg', conversionFactor: 1.00 },
    { name: 'Gram', code: 'g', category: UNIT_CATEGORIES.WEIGHT, abbreviation: 'g', conversionFactor: 1000.00 },
    { name: 'Pound', code: 'lb', category: UNIT_CATEGORIES.WEIGHT, abbreviation: 'lb', conversionFactor: 2.20 },
    { name: 'Ounce', code: 'oz', category: UNIT_CATEGORIES.WEIGHT, abbreviation: 'oz', conversionFactor: 35.27 },
    { name: 'Ton', code: 'ton', category: UNIT_CATEGORIES.WEIGHT, abbreviation: 't', conversionFactor: 0.001 },
    
    // VOLUME
    { name: 'Liter', code: 'L', category: UNIT_CATEGORIES.VOLUME, abbreviation: 'L', conversionFactor: 1.00 },
    { name: 'Milliliter', code: 'mL', category: UNIT_CATEGORIES.VOLUME, abbreviation: 'mL', conversionFactor: 1000.00 },
    { name: 'Gallon', code: 'gal', category: UNIT_CATEGORIES.VOLUME, abbreviation: 'gal', conversionFactor: 3.78 },
    { name: 'Cubic Meter', code: 'm3', category: UNIT_CATEGORIES.VOLUME, abbreviation: 'm³', conversionFactor: 0.001 },
    
    // COUNT
    { name: 'Piece', code: 'pcs', category: UNIT_CATEGORIES.COUNT, abbreviation: 'pcs', conversionFactor: 1.00 },
    { name: 'Box', code: 'box', category: UNIT_CATEGORIES.COUNT, abbreviation: 'box', conversionFactor: 1.00 },
    { name: 'Dozen', code: 'doz', category: UNIT_CATEGORIES.COUNT, abbreviation: 'doz', conversionFactor: 0.083 },
    { name: 'Set', code: 'set', category: UNIT_CATEGORIES.COUNT, abbreviation: 'set', conversionFactor: 1.00 },
    { name: 'Pack', code: 'pack', category: UNIT_CATEGORIES.COUNT, abbreviation: 'pack', conversionFactor: 1.00 },
    { name: 'Carton', code: 'ctn', category: UNIT_CATEGORIES.COUNT, abbreviation: 'ctn', conversionFactor: 1.00 },
    { name: 'Roll', code: 'roll', category: UNIT_CATEGORIES.COUNT, abbreviation: 'roll', conversionFactor: 1.00 },
    { name: 'Bottle', code: 'btl', category: UNIT_CATEGORIES.COUNT, abbreviation: 'btl', conversionFactor: 1.00 },
    { name: 'Can', code: 'can', category: UNIT_CATEGORIES.COUNT, abbreviation: 'can', conversionFactor: 1.00 },
    { name: 'Sack', code: 'sack', category: UNIT_CATEGORIES.COUNT, abbreviation: 'sack', conversionFactor: 1.00 },
    
    // LENGTH
    { name: 'Meter', code: 'm', category: UNIT_CATEGORIES.LENGTH, abbreviation: 'm', conversionFactor: 1.00 },
    { name: 'Centimeter', code: 'cm', category: UNIT_CATEGORIES.LENGTH, abbreviation: 'cm', conversionFactor: 100.00 },
    { name: 'Millimeter', code: 'mm', category: UNIT_CATEGORIES.LENGTH, abbreviation: 'mm', conversionFactor: 1000.00 },
    { name: 'Kilometer', code: 'km', category: UNIT_CATEGORIES.LENGTH, abbreviation: 'km', conversionFactor: 0.001 },
    { name: 'Inch', code: 'in', category: UNIT_CATEGORIES.LENGTH, abbreviation: 'in', conversionFactor: 39.37 },
    { name: 'Foot', code: 'ft', category: UNIT_CATEGORIES.LENGTH, abbreviation: 'ft', conversionFactor: 3.28 },
    
    // AREA
    { name: 'Square Meter', code: 'm2', category: UNIT_CATEGORIES.AREA, abbreviation: 'm²', conversionFactor: 1.00 },
    { name: 'Square Centimeter', code: 'cm2', category: UNIT_CATEGORIES.AREA, abbreviation: 'cm²', conversionFactor: 10000.00 },
    { name: 'Square Foot', code: 'ft2', category: UNIT_CATEGORIES.AREA, abbreviation: 'ft²', conversionFactor: 10.76 },
];