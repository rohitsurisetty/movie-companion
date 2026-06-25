// Location utility functions

/**
 * Extracts partial location (Area, City, State, Country) from a full address string.
 * This is used to protect user privacy by not displaying full addresses in the UI.
 * 
 * @param fullLocation - The complete location string (e.g., "123 Main St, Koramangala, Bangalore, Karnataka, India")
 * @returns Partial location showing only Area, City, State, Country (e.g., "Koramangala, Bangalore, Karnataka, India")
 */
export const getPartialLocation = (fullLocation: string | undefined | null): string => {
  if (!fullLocation) return '';
  
  // Split by comma and trim each part
  const parts = fullLocation.split(',').map(p => p.trim()).filter(Boolean);
  
  if (parts.length === 0) return fullLocation;
  
  // Patterns to identify private info (house numbers, street names, etc.)
  const privatePatterns = [
    /^\\d+[\\s,]*/,           // Leading numbers (house numbers)
    /^#\\d+/,                 // Apartment numbers like #123
    /^flat\\s*\\d*/i,         // Flat numbers
    /^apt\\.?\\s*\\d*/i,      // Apartment numbers
    /^block\\s*[a-z0-9]*/i,   // Block names
    /^tower\\s*[a-z0-9]*/i,   // Tower names
    /^building\\s*[a-z0-9]*/i, // Building names
    /^floor\\s*\\d*/i,        // Floor numbers
    /\\d{5,6}/,               // Postal codes (5-6 digits)
  ];
  
  const streetTerms = /\\b(street|st\\.|road|rd\\.|lane|ln\\.|avenue|ave\\.|drive|dr\\.|way|place|pl\\.|nagar|gali|marg|path|colony|society|complex|apartments?|residency|enclave|layout|sector|phase)\\b/i;
  
  // Filter out parts that contain private info
  const filteredParts = parts.filter(part => {
    // Skip parts that are just numbers
    if (/^\\d+$/.test(part)) return false;
    
    // Skip parts containing street terms
    if (streetTerms.test(part)) return false;
    
    // Check against removal patterns
    for (const pattern of privatePatterns) {
      if (pattern.test(part)) return false;
    }
    
    // Skip very short parts (likely abbreviations)
    if (part.length < 3) return false;
    
    return true;
  });
  
  // If we filtered too much, take last 3-4 parts
  if (filteredParts.length === 0) {
    return parts.slice(-4).join(', ');
  }
  
  // Return at most 4 parts: Area, City, State, Country
  return filteredParts.slice(-4).join(', ');
};

/**
 * Extracts just the city name from a location string
 * 
 * @param fullLocation - The complete location string
 * @returns City name only
 */
export const getCityFromLocation = (fullLocation: string | undefined | null): string => {
  if (!fullLocation) return '';
  
  const parts = fullLocation.split(',').map(p => p.trim());
  
  // For short strings, return first part
  if (parts.length <= 2) return parts[0] || '';
  
  // For longer strings, return the 3rd from last (usually city)
  return parts[parts.length - 3] || parts[0] || '';
};

/**
 * Extracts a simplified location showing only Area and City.
 * This is the most privacy-friendly option for public display.
 * 
 * Example: "HSR Layout, Bengaluru, Karnataka, India, 560102" -> "HSR Layout, Bengaluru"
 * 
 * @param fullLocation - The complete location string
 * @returns Area and City only (e.g., "HSR Layout, Bengaluru")
 */
export const getSimplifiedLocation = (fullLocation: string | undefined | null): string => {
  if (!fullLocation) return '';
  
  // Split by comma and trim each part
  const parts = fullLocation.split(',').map(p => p.trim()).filter(Boolean);
  
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  
  // Remove postal codes (5-6 digit numbers)
  const filteredParts = parts.filter(part => !/^\d{5,6}$/.test(part.trim()));
  
  // Try to identify Area and City
  // Common patterns: [Area], [City], [State], [Country]
  // We want first 2 relevant parts (Area and City)
  
  // Skip parts that are state/country names
  const stateCountryPatterns = /\b(india|karnataka|maharashtra|delhi|tamil\s*nadu|andhra\s*pradesh|telangana|kerala|west\s*bengal|gujarat|rajasthan|punjab|haryana|uttar\s*pradesh|madhya\s*pradesh|bihar|odisha|chhattisgarh|jharkhand|uttarakhand|himachal\s*pradesh|assam|goa)\b/i;
  
  const relevantParts: string[] = [];
  
  for (const part of filteredParts) {
    if (stateCountryPatterns.test(part)) continue;
    relevantParts.push(part);
    if (relevantParts.length >= 2) break;
  }
  
  if (relevantParts.length === 0) {
    // Fallback: just return first two parts
    return filteredParts.slice(0, 2).join(', ');
  }
  
  return relevantParts.join(', ');
};
