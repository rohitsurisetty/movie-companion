// Location utility functions
// (Pincode → area lookup lives in ./locationFormatter — formatLocationForPrivacy.)

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
    /^\d+[\s,]*/,           // Leading numbers (house numbers)
    /^#\d+/,                 // Apartment numbers like #123
    /^flat\s*\d*/i,         // Flat numbers
    /^apt\.?\s*\d*/i,      // Apartment numbers
    /^block\s*[a-z0-9]*/i,   // Block names
    /^tower\s*[a-z0-9]*/i,   // Tower names
    /^building\s*[a-z0-9]*/i, // Building names
    /^floor\s*\d*/i,        // Floor numbers
    /\d{5,6}/,               // Postal codes (5-6 digits)
  ];

  // NB: "st.", "rd." etc. end in "." so they can't sit before a closing \b —
  // they get their own (?!\w) alternative.
  const streetTerms = /\b(?:(?:street|road|lane|avenue|drive|way|place|nagar|gali|marg|path|colony|society|complex|apartments?|residency|enclave|layout|sector|phase)\b|(?:st|rd|ln|ave|dr|pl)\.(?!\w))/i;

  // Filter out parts that contain private info
  const filteredParts = parts.filter(part => {
    // Skip parts that are just numbers
    if (/^\d+$/.test(part)) return false;
    
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
  
  // If we filtered too much, take the last 3-4 parts that carry no digits
  // (never re-expose house numbers / pincodes through the fallback).
  if (filteredParts.length === 0) {
    return parts.filter(p => !/\d/.test(p)).slice(-4).join(', ');
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
 * Example: "122, Eleventh Main Road, HSR Layout, Bengaluru, Karnataka 560102, India" -> "HSR Layout, Bengaluru"
 * 
 * @param fullLocation - The complete location string
 * @returns Area and City only (e.g., "HSR Layout, Bengaluru")
 */
export const getSimplifiedLocation = (fullLocation: string | undefined | null): string => {
  if (!fullLocation) return '';
  
  // Split by comma and trim each part
  let parts = fullLocation.split(',').map(p => p.trim()).filter(Boolean);
  
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  
  // Remove postal codes (5-6 digit numbers)
  parts = parts.map(part => part.replace(/\b\d{5,6}\b/g, '').trim()).filter(p => p.length > 0);
  
  // Patterns to remove
  const stateCountryPatterns = /^(india|karnataka|maharashtra|delhi|tamil\s*nadu|andhra\s*pradesh|telangana|kerala|west\s*bengal|gujarat|rajasthan|punjab|haryana|uttar\s*pradesh|madhya\s*pradesh|bihar|odisha|chhattisgarh|jharkhand|uttarakhand|himachal\s*pradesh|assam|goa|sikkim|tripura|meghalaya|manipur|mizoram|nagaland|arunachal\s*pradesh)$/i;
  
  // Private info patterns to filter out
  const shouldRemovePart = (part: string): boolean => {
    const lowerPart = part.toLowerCase();
    
    // Remove state/country names
    if (stateCountryPatterns.test(part.trim())) return true;
    
    // Remove if starts with numbers (house numbers like "122", "L 141")
    if (/^[A-Z]?\s*\d+/i.test(part)) return true;
    if (/^\d+[A-Z]?[\s\-\/]/i.test(part)) return true;
    
    // Remove if it's just a number pattern
    if (/^\d+[\/\-]?\d*$/.test(part)) return true;
    
    // Remove parts containing "Main Road", "Cross", or ordinal + road patterns
    // This catches "Eleventh Main Road", "5th Cross", "12th Main", etc.
    if (/\b(main\s*road|cross|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+(?:st|nd|rd|th))\b/i.test(lowerPart) && 
        /\b(road|street|lane|main|cross|avenue|drive|way|marg|gali)\b/i.test(lowerPart)) return true;
    
    // Remove standalone street terms
    if (/^(main\s+)?(road|street|lane|avenue|drive|way|marg|gali|cross)(\s+\d+)?$/i.test(part)) return true;
    
    // Skip very short parts (likely abbreviations)
    if (part.length < 3) return true;
    
    return false;
  };
  
  let relevantParts: string[] = [];
  
  for (const part of parts) {
    if (shouldRemovePart(part)) continue;
    relevantParts.push(part);
    if (relevantParts.length >= 2) break;
  }
  
  // Additional cleanup: Remove "Sector X" patterns and replace with proper area names
  relevantParts = relevantParts.map(part => {
    // If part contains "Sector" followed by number/letter and area name, extract just the area name
    // e.g., "Sector 6 HSR" -> "HSR Layout", "Sector 4 BTM" -> "BTM Layout"
    const sectorMatch = part.match(/sector\s*\d*\s*(hsr|btm|electronic\s*city|whitefield|koramangala|indiranagar|jayanagar)/i);
    if (sectorMatch) {
      const areaName = sectorMatch[1].toUpperCase();
      if (areaName === 'HSR') return 'HSR Layout';
      if (areaName === 'BTM') return 'BTM Layout';
      return sectorMatch[1].charAt(0).toUpperCase() + sectorMatch[1].slice(1).toLowerCase();
    }
    // If part is just "Sector X" without area name, skip it
    if (/^sector\s*\d+$/i.test(part.trim())) return null;
    return part;
  }).filter(Boolean) as string[];
  
  if (relevantParts.length === 0) {
    // Fallback: find city from last parts
    const lastParts = parts.slice(-4);
    const city = lastParts.find(p => !stateCountryPatterns.test(p.trim()) && p.length > 2);
    return city || parts[parts.length - 2] || parts[0] || '';
  }
  
  return relevantParts.join(', ');
};
