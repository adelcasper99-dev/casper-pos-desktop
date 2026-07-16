/**
 * Normalizes master data names (e.g., Models, Categories) to prevent case-sensitive
 * and space-based duplicates in offline-first distributed synchronization.
 * Rules:
 * 1. Trim leading/trailing spaces.
 * 2. Collapse multiple internal spaces into a single space.
 * 3. Capitalize the first letter of each word (Title Case) and lowercase the rest.
 */
export function normalizeMasterDataName(name: string): string {
  if (!name) return "";
  
  // 1 & 2: Trim and collapse multiple spaces
  const cleanedName = name.trim().replace(/\s+/g, " ");
  
  // 3: Title Case
  return cleanedName
    .split(" ")
    .map((word) => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
