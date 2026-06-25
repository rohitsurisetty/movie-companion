// Location utility functions

// Indian pincode to area/city mapping (expandable)
const PINCODE_MAP: Record<string, { area: string; city: string }> = {
  // Bangalore pincodes
  '560102': { area: 'HSR Layout', city: 'Bangalore' },
  '560034': { area: 'HSR Layout', city: 'Bangalore' },
  '560068': { area: 'BTM Layout', city: 'Bangalore' },
  '560076': { area: 'BTM Layout', city: 'Bangalore' },
  '560095': { area: 'Whitefield', city: 'Bangalore' },
  '560066': { area: 'Whitefield', city: 'Bangalore' },
  '560001': { area: 'MG Road', city: 'Bangalore' },
  '560002': { area: 'Shivajinagar', city: 'Bangalore' },
  '560003': { area: 'Ulsoor', city: 'Bangalore' },
  '560004': { area: 'Frazer Town', city: 'Bangalore' },
  '560008': { area: 'Shantinagar', city: 'Bangalore' },
  '560011': { area: 'Malleshwaram', city: 'Bangalore' },
  '560017': { area: 'Koramangala', city: 'Bangalore' },
  '560029': { area: 'Banashankari', city: 'Bangalore' },
  '560030': { area: 'Adugodi', city: 'Bangalore' },
  '560038': { area: 'Indiranagar', city: 'Bangalore' },
  '560041': { area: 'Jayanagar', city: 'Bangalore' },
  '560047': { area: 'HAL', city: 'Bangalore' },
  '560070': { area: 'Bannerghatta Road', city: 'Bangalore' },
  '560078': { area: 'Electronic City', city: 'Bangalore' },
  '560100': { area: 'Sarjapur', city: 'Bangalore' },
  '560103': { area: 'Bellandur', city: 'Bangalore' },
  // Mumbai pincodes
  '400001': { area: 'Fort', city: 'Mumbai' },
  '400050': { area: 'Bandra West', city: 'Mumbai' },
  '400051': { area: 'Bandra East', city: 'Mumbai' },
  '400053': { area: 'Andheri West', city: 'Mumbai' },
  '400069': { area: 'Andheri East', city: 'Mumbai' },
  '400076': { area: 'Powai', city: 'Mumbai' },
  '400097': { area: 'Malad', city: 'Mumbai' },
  // Delhi pincodes
  '110001': { area: 'Connaught Place', city: 'Delhi' },
  '110017': { area: 'Hauz Khas', city: 'Delhi' },
  '110019': { area: 'Saket', city: 'Delhi' },
  '110020': { area: 'Greater Kailash', city: 'Delhi' },
  '110024': { area: 'Defence Colony', city: 'Delhi' },
  '110025': { area: 'Lajpat Nagar', city: 'Delhi' },
  '110048': { area: 'Chanakyapuri', city: 'Delhi' },
  '110049': { area: 'Vasant Vihar', city: 'Delhi' },
  // Chennai pincodes
  '600001': { area: 'George Town', city: 'Chennai' },
  '600004': { area: 'T Nagar', city: 'Chennai' },
  '600018': { area: 'Adyar', city: 'Chennai' },
  '600020': { area: 'Nungambakkam', city: 'Chennai' },
  '600034': { area: 'Anna Nagar', city: 'Chennai' },
  '600096': { area: 'OMR', city: 'Chennai' },
  // Hyderabad pincodes
  '500001': { area: 'Charminar', city: 'Hyderabad' },
  '500034': { area: 'Jubilee Hills', city: 'Hyderabad' },
  '500081': { area: 'Madhapur', city: 'Hyderabad' },
  '500084': { area: 'Gachibowli', city: 'Hyderabad' },
  // Pune pincodes
  '411001': { area: 'Camp', city: 'Pune' },
  '411006': { area: 'Deccan', city: 'Pune' },
  '411014': { area: 'Koregaon Park', city: 'Pune' },
  '411057': { area: 'Hinjewadi', city: 'Pune' },
  // Kolkata pincodes
  '700001': { area: 'BBD Bagh', city: 'Kolkata' },
  '700019': { area: 'Park Street', city: 'Kolkata' },
  '700029': { area: 'Salt Lake', city: 'Kolkata' },
};

/**
 * Extracts pincode from a location string
 */
const extractPincode = (location: string): string | null => {
  // Match 6-digit Indian pincode
  const pincodeMatch = location.match(/\b(\d{6})\b/);
  return pincodeMatch ? pincodeMatch[1] : null;
};

/**
 * Get area and city from pincode
 */
const getLocationFromPincode = (pincode: string): { area: string; city: string } | null => {
  return PINCODE_MAP[pincode] || null;
};

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
  
  const relevantParts: string[] = [];
  
  for (const part of parts) {
    if (shouldRemovePart(part)) continue;
    relevantParts.push(part);
    if (relevantParts.length >= 2) break;
  }
  
  if (relevantParts.length === 0) {
    // Fallback: find city from last parts
    const lastParts = parts.slice(-4);
    const city = lastParts.find(p => !stateCountryPatterns.test(p.trim()) && p.length > 2);
    return city || parts[parts.length - 2] || parts[0] || '';
  }
  
  return relevantParts.join(', ');
};
