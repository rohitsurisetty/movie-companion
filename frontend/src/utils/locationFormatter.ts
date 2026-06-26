/**
 * Utility function to format location for privacy
 * Only shows: Area/Neighborhood and City
 * Hides: House number, street name, apartment, postal address, coordinates, state, country
 * 
 * Primary approach: Extract pincode and use mapping for area/city
 * Fallback: Regex-based extraction
 * 
 * Example: "122, Eleventh Main Road, HSR Layout, Bengaluru, Karnataka 560102, India"
 * Returns: "HSR Layout, Bangalore"
 */

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
function extractPincode(location: string): string | null {
  // Match 6-digit Indian pincode
  const pincodeMatch = location.match(/\b(\d{6})\b/);
  return pincodeMatch ? pincodeMatch[1] : null;
}

/**
 * Get area and city from pincode
 */
function getLocationFromPincode(pincode: string): { area: string; city: string } | null {
  return PINCODE_MAP[pincode] || null;
}

export function formatLocationForPrivacy(fullLocation: any): string {
  // Defensive: backend may sometimes send a non-string (object, null, number).
  // Coerce safely so we never crash with "trim is not a function".
  if (fullLocation == null) {
    return '';
  }
  if (typeof fullLocation !== 'string') {
    // Support {city, state, country} shape gracefully.
    if (typeof fullLocation === 'object') {
      const obj: any = fullLocation;
      const parts = [obj.area, obj.city, obj.state, obj.country]
        .filter((p) => typeof p === 'string' && p.trim().length > 0);
      if (parts.length === 0) return '';
      fullLocation = parts.join(', ');
    } else {
      fullLocation = String(fullLocation);
    }
  }
  if (!fullLocation || fullLocation.trim() === '') {
    return '';
  }

  // PRIMARY APPROACH: Try pincode-based lookup first
  const pincode = extractPincode(fullLocation);
  if (pincode) {
    const mappedLocation = getLocationFromPincode(pincode);
    if (mappedLocation) {
      return `${mappedLocation.area}, ${mappedLocation.city}`;
    }
  }

  // FALLBACK: Regex-based extraction
  // Split by comma and clean up
  let parts = fullLocation.split(',').map(p => p.trim()).filter(Boolean);
  
  if (parts.length === 0) return fullLocation;
  
  // First, clean postal codes from all parts
  parts = parts.map(part => {
    // Remove 5-6 digit postal codes
    return part.replace(/\b\d{5,6}\b/g, '').trim();
  }).filter(p => p.length > 0);
  
  // Known state/country names to remove
  const stateCountryPatterns = /^(india|karnataka|maharashtra|delhi|tamil\s*nadu|andhra\s*pradesh|telangana|kerala|west\s*bengal|gujarat|rajasthan|punjab|haryana|uttar\s*pradesh|madhya\s*pradesh|bihar|odisha|chhattisgarh|jharkhand|uttarakhand|himachal\s*pradesh|assam|goa|sikkim|tripura|meghalaya|manipur|mizoram|nagaland|arunachal\s*pradesh)$/i;
  
  // Patterns that indicate PRIVATE/SPECIFIC location info to REMOVE
  const shouldRemovePart = (part: string): boolean => {
    const lowerPart = part.toLowerCase();
    
    // Remove state/country names
    if (stateCountryPatterns.test(part.trim())) return true;
    
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

  // Filter parts
  let filteredParts = parts.filter(part => !shouldRemovePart(part));
  
  // Additional cleanup: Remove "Sector X" patterns and replace with proper area names
  filteredParts = filteredParts.map(part => {
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

  // If we filtered too much, fall back to city detection
  if (filteredParts.length === 0) {
    // Try to find city from last 4 parts
    const lastParts = parts.slice(-4);
    const city = lastParts.find(p => !stateCountryPatterns.test(p.trim()) && p.length > 2);
    return city || parts[parts.length - 2] || parts[0] || '';
  }

  // Return only Area and City (first 2 filtered parts)
  return filteredParts.slice(0, 2).join(', ');
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
