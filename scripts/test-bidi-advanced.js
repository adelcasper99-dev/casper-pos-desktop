const ArabicReshaper = require('arabic-reshaper');
const bidiFactory = require('bidi-js');
const bidi = bidiFactory();

const tests = [
    "الفاتورة", // Has Lam-Alef
    "رقم الفاتورة: B93BE0A3"
];

tests.forEach(text => {
    console.log("--- Testing: " + text + " ---");
    const reshaped = ArabicReshaper.convertArabic(text);
    console.log("Original length: " + text.length);
    console.log("Reshaped length: " + reshaped.length);

    try {
        const levelsOriginal = bidi.getEmbeddingLevels(text, 'rtl');
        const reversedWithOriginalLevels = bidi.getReorderedString(reshaped, levelsOriginal);
        console.log("Reversed (Original Levels): " + reversedWithOriginalLevels);
    } catch (e) {
        console.log("Failed with Original Levels: " + e.message);
    }

    const levelsReshaped = bidi.getEmbeddingLevels(reshaped, 'rtl');
    const reversedWithReshapedLevels = bidi.getReorderedString(reshaped, levelsReshaped);
    console.log("Reversed (Reshaped Levels): " + reversedWithReshapedLevels);
});
