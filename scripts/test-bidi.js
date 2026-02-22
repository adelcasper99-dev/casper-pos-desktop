const ArabicReshaper = require('arabic-reshaper');
const bidiFactory = require('bidi-js');
const bidi = bidiFactory();

const text = "رقم الفاتورة: B93BE0A3";

const reshaped = ArabicReshaper.convertArabic(text);
const levels = bidi.getEmbeddingLevels(text, 'rtl');
const reversed = bidi.getReorderedString(reshaped, levels);

console.log("Original: " + text);
console.log("Reshaped: " + reshaped);
console.log("Reversed: " + reversed);
