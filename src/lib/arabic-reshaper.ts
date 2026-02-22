import ArabicReshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

/**
 * Reshapes Arabic characters to their connected Presentation Forms and
 * reverses the string using the Bidirectional Algorithm so that LTR
 * generic text printers output Arabic RTL naturally.
 */
export function formatArabicPrintText(text: string | null | undefined): string {
    if (!text) return '';
    try {
        // 1. Reshape characters to their presentation forms (join them)
        const reshaped = ArabicReshaper.convertArabic(text);

        // 2. Determine Bidi Levels based on ORIGINAL TEXT
        // (Bidi-JS might misclassify Presentation Forms as LTR or neutral,
        // so we ask the engine to classify the original true Arabic characters instead).
        const embeddingLevels = bidi.getEmbeddingLevels(text, 'rtl');

        // 3. Reorder the string visually using those levels.
        return bidi.getReorderedString(reshaped, embeddingLevels);
    } catch (error) {
        console.error("Error formatting Arabic print text:", error);
        return text; // Fallback to original
    }
}
