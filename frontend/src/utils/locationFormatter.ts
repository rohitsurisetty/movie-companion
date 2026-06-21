/**
 * Utility function to format location for privacy
 * Only shows: Region/Area, City, State, Country
 * Hides: House number, apartment, street name, postal address, coordinates
 * 
 * Example: "L 141, Opposite Rajesh Jewellery Mart, HSR Layout, Bengaluru, Karnataka 560102, India"
 * Returns: "HSR Layout, Bengaluru, Karnataka, India"
 */

export function formatLocationForPrivacy(fullLocation: string): string {
  if (!fullLocation || fullLocation.trim() === '') {
    return '';
  }

  // Split by comma and clean up
  let parts = fullLocation.split(',').map(p => p.trim()).filter(Boolean);
  
  if (parts.length === 0) return fullLocation;
  
  // First, clean postal codes from all parts
  parts = parts.map(part => {
    // Remove 5-6 digit postal codes
    return part.replace(/\b\d{5,6}\b/g, '').trim();
  }).filter(p => p.length > 0);
  
  // Patterns that indicate PRIVATE/SPECIFIC location info to REMOVE
  const shouldRemovePart = (part: string): boolean => {
    const lowerPart = part.toLowerCase();
    
    // Remove if starts with numbers or letter+number (house numbers like "L 141", "123", "B-23")
    if (/^[A-Z]?\s*\d+/i.test(part)) return true;
    if (/^\d+[A-Z]?[\s\-\/]/i.test(part)) return true;
    
    // Remove if starts with directional/positional words
    if (/^(opposite|opp\.?|near|nr\.?|behind|beside|next to|in front|adjacent|above|below)\s/i.test(part)) return true;
    
    // Remove if contains commercial/landmark identifiers
    if (/\b(mart|shop|store|jewellery|jewelry|hospital|hotel|mall|cinema|theatre|theater|bank|atm|petrol|gas station|showroom|plaza|arcade|complex)\b/i.test(part)) return true;
    
    // Remove apartment/building identifiers with numbers
    if (/^(flat|apt|apartment|block|tower|building|floor|plot|door|unit|no\.?)\s*[#\d]/i.test(part)) return true;
    
    // Remove if it's just a number pattern
    if (/^\d+[\/\-]?\d*$/.test(part)) return true;
    
    // Remove common street suffixes ONLY if they're the main content
    // Be careful not to remove neighborhood names like "HSR Layout"
    if (/^(main\s+)?(road|street|lane|avenue|drive|way|marg|gali|cross)(\s+\d+)?$/i.test(part)) return true;
    
    // Skip very short parts (likely abbreviations)
    if (part.length < 3) return true;
    
    return false;
  };

  // Filter parts
  const filteredParts = parts.filter(part => !shouldRemovePart(part));

  // If we filtered too much, fall back to last 4 parts (usually reliable)
  if (filteredParts.length === 0) {
    return parts.slice(-4).join(', ');
  }

  // Return at most 4 parts: Area, City, State, Country
  return filteredParts.slice(-4).join(', ');
}

/**
 * Extract city name from full location
 */
export function extractCity(fullLocation: string): string {
  if (!fullLocation) return '';
  
  const parts = fullLocation.split(',').map(p => p.trim());
  
  // City is usually the 2nd or 3rd from last part
  if (parts.length >= 3) {
    return parts[parts.length - 3] || parts[parts.length - 2] || '';
  } else if (parts.length >= 2) {
    return parts[0];
  }
  
  return fullLocation;
}

/**
 * Check if location looks like it contains private information
 */
export function hasPrivateInfo(location: string): boolean {
  const privatePatterns = [
    /^\d+/,                  // Starts with number
    /flat|apt|apartment|building|tower|floor|block/i,
    /\d{5,6}/,              // Postal code
  ];
  
  return privatePatterns.some(pattern => pattern.test(location));
}
