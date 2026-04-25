// Location utility functions

/**
 * Extracts partial location (City, State, Country) from a full address string.
 * This is used to protect user privacy by not displaying full addresses in the UI.
 * 
 * @param fullLocation - The complete location string (e.g., "123 Main St, Koramangala, Bangalore, Karnataka, India")
 * @returns Partial location showing only City, State, Country (e.g., "Bangalore, Karnataka, India")
 */
export const getPartialLocation = (fullLocation: string | undefined | null): string => {
  if (!fullLocation) return '';
  
  // Split by comma and trim each part
  const parts = fullLocation.split(',').map(p => p.trim());
  
  // If 3 or fewer parts, return as is
  if (parts.length <= 3) return fullLocation;
  
  // Take last 3 parts (typically City, State, Country)
  return parts.slice(-3).join(', ');
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
