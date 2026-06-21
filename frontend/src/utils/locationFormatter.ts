/**
 * Utility function to format location for privacy
 * Only shows: Region/Area, City, State, Country
 * Hides: House number, apartment, street name, postal address, coordinates
 */

export function formatLocationForPrivacy(fullLocation: string): string {
  if (!fullLocation || fullLocation.trim() === '') {
    return '';
  }

  // Split by comma and clean up
  const parts = fullLocation.split(',').map(p => p.trim()).filter(Boolean);
  
  if (parts.length === 0) return fullLocation;
  
  // Common patterns to remove (house numbers, street names, postal codes)
  const patternsToRemove = [
    /^\d+[\s,]*/,           // Leading numbers (house numbers)
    /^#\d+[\s,]*/,          // Apartment numbers like #123
    /^\d+-\d+[\s,]*/,       // Range numbers like 12-14
    /^flat\s*\d*/i,         // Flat numbers
    /^apt\.?\s*\d*/i,       // Apartment numbers
    /^block\s*[a-z0-9]*/i,  // Block names
    /^tower\s*[a-z0-9]*/i,  // Tower names
    /^building\s*[a-z0-9]*/i, // Building names
    /^floor\s*\d*/i,        // Floor numbers
    /\d{5,6}/,              // Postal codes (5-6 digits)
    /^\d+\/\d+/,            // Numbers like 12/3
  ];

  // Filter out parts that match removal patterns
  const filteredParts = parts.filter(part => {
    // Skip parts that are just numbers or start with numbers
    if (/^\d+$/.test(part)) return false;
    
    // Skip parts containing "Street", "Road", "Lane", "Avenue", etc.
    const streetTerms = /\b(street|st\.|road|rd\.|lane|ln\.|avenue|ave\.|drive|dr\.|way|place|pl\.|nagar|gali|marg|path|colony|society|complex|apartments?|residency|enclave|layout|sector|phase)\b/i;
    if (streetTerms.test(part)) return false;
    
    // Check against removal patterns
    for (const pattern of patternsToRemove) {
      if (pattern.test(part)) return false;
    }
    
    // Skip very short parts (likely abbreviations or codes)
    if (part.length < 3) return false;
    
    return true;
  });

  // If we filtered too much, try to keep at least the last few meaningful parts
  if (filteredParts.length === 0) {
    // Take last 3-4 parts which are usually City, State, Country
    const lastParts = parts.slice(-4);
    return lastParts.join(', ');
  }

  // Take at most 4 parts: Area, City, State, Country
  const result = filteredParts.slice(-4);
  
  return result.join(', ');
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
    /street|road|lane|avenue|drive/i,
  ];
  
  return privatePatterns.some(pattern => pattern.test(location));
}
