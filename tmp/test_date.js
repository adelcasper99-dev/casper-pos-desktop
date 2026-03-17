
const dt = new Date("2026-03-16T22:41:58Z");
console.log("Original Date:", dt.toISOString());
console.log("en-CA Date:", dt.toLocaleDateString('en-CA'));
console.log("hireDate (March 17):", new Date("2026-03-17T00:00:00Z").toLocaleDateString('en-CA'));
