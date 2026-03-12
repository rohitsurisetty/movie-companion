#!/usr/bin/env python3
"""
Backend API Testing for Film Companion Movie APIs
Tests the TMDB movie feed and details endpoints
"""

import requests
import json
import os
import sys
from urllib.parse import urljoin

# Base URL from frontend env
BASE_URL = "https://showtime-setup.preview.emergentagent.com"
API_BASE_URL = f"{BASE_URL}/api"

def test_api_endpoint(method, endpoint, params=None, data=None, description=""):
    """Helper function to test API endpoints"""
    # Ensure endpoint starts with /api if it doesn't already
    if not endpoint.startswith('/api/'):
        endpoint = f"/api{endpoint}" if not endpoint.startswith('/') else f"/api{endpoint}"
    url = urljoin(BASE_URL, endpoint)
    print(f"\n{'='*60}")
    print(f"Testing: {description}")
    print(f"Method: {method}")
    print(f"URL: {url}")
    if params:
        print(f"Params: {params}")
    if data:
        print(f"Data: {data}")
    print(f"{'='*60}")
    
    try:
        if method.upper() == 'GET':
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == 'POST':
            response = requests.post(url, json=data, timeout=30)
        else:
            print(f"❌ Unsupported method: {method}")
            return False
            
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            try:
                json_response = response.json()
                print("✅ SUCCESS: Got valid JSON response")
                print(f"Response preview: {json.dumps(json_response, indent=2)[:500]}...")
                return True, json_response
            except json.JSONDecodeError:
                print("❌ FAILED: Response is not valid JSON")
                print(f"Raw response: {response.text[:500]}...")
                return False, None
        else:
            print(f"❌ FAILED: HTTP {response.status_code}")
            print(f"Error response: {response.text[:500]}...")
            return False, None
            
    except requests.exceptions.ConnectionError as e:
        print(f"❌ CONNECTION ERROR: {e}")
        return False, None
    except requests.exceptions.Timeout as e:
        print(f"❌ TIMEOUT ERROR: {e}")
        return False, None
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {e}")
        return False, None

def validate_movie_feed_response(response_data):
    """Validate the structure of movie feed response"""
    print("\n🔍 Validating Movie Feed Response Structure...")
    
    required_top_level = ["results", "page"]
    for field in required_top_level:
        if field not in response_data:
            print(f"❌ Missing required field: {field}")
            return False
    
    results = response_data.get("results", [])
    if not isinstance(results, list):
        print(f"❌ 'results' should be a list, got {type(results)}")
        return False
        
    if len(results) == 0:
        print("⚠️  WARNING: No movies in results")
        return True
        
    # Check first movie structure
    movie = results[0]
    required_movie_fields = ["id", "title", "poster_path", "vote_average", "genre_ids"]
    for field in required_movie_fields:
        if field not in movie:
            print(f"❌ Missing required movie field: {field}")
            return False
    
    # Type validations
    if not isinstance(movie["id"], int):
        print(f"❌ Movie id should be int, got {type(movie['id'])}")
        return False
        
    if not isinstance(movie["vote_average"], (int, float)):
        print(f"❌ vote_average should be number, got {type(movie['vote_average'])}")
        return False
        
    if not isinstance(movie["genre_ids"], list):
        print(f"❌ genre_ids should be list, got {type(movie['genre_ids'])}")
        return False
    
    print(f"✅ Movie feed response structure is valid. Found {len(results)} movies.")
    return True

def validate_movie_details_response(response_data):
    """Validate the structure of movie details response"""
    print("\n🔍 Validating Movie Details Response Structure...")
    
    required_fields = ["id", "title", "overview", "runtime", "genres", "cast", "directors"]
    for field in required_fields:
        if field not in response_data:
            print(f"❌ Missing required field: {field}")
            return False
    
    # Type validations
    if not isinstance(response_data["id"], int):
        print(f"❌ Movie id should be int, got {type(response_data['id'])}")
        return False
        
    if not isinstance(response_data["runtime"], int):
        print(f"❌ runtime should be int, got {type(response_data['runtime'])}")
        return False
        
    if not isinstance(response_data["genres"], list):
        print(f"❌ genres should be list, got {type(response_data['genres'])}")
        return False
        
    if not isinstance(response_data["cast"], list):
        print(f"❌ cast should be list, got {type(response_data['cast'])}")
        return False
        
    if not isinstance(response_data["directors"], list):
        print(f"❌ directors should be list, got {type(response_data['directors'])}")
        return False
    
    print(f"✅ Movie details response structure is valid.")
    print(f"   - Movie: {response_data['title']}")
    print(f"   - Runtime: {response_data['runtime']} minutes")
    print(f"   - Genres: {response_data['genres']}")
    print(f"   - Directors: {response_data['directors']}")
    print(f"   - Cast: {len(response_data['cast'])} actors")
    return True

def main():
    """Main test function"""
    print("🎬 Film Companion Backend API Testing")
    print(f"🌐 Base URL: {BASE_URL}")
    print(f"🎯 API Base: {API_BASE_URL}")
    
    test_results = {
        "movie_feed_basic": False,
        "movie_feed_with_genres": False,
        "movie_feed_with_exclude": False,
        "movie_details_fight_club": False,
        "movie_details_inception": False
    }
    
    # Test 1: Basic Movie Feed API
    print("\n" + "="*80)
    print("TEST 1: Movie Feed API - Basic (No Parameters)")
    print("="*80)
    success, response = test_api_endpoint(
        "GET", 
        "/tmdb/feed", 
        description="Get movie feed with no parameters (should return popular movies)"
    )
    if success and response:
        test_results["movie_feed_basic"] = validate_movie_feed_response(response)
    
    # Test 2: Movie Feed with Genres
    print("\n" + "="*80)
    print("TEST 2: Movie Feed API - With Genres Parameter")
    print("="*80)
    success, response = test_api_endpoint(
        "GET", 
        "/tmdb/feed", 
        params={"genres": "Action,Comedy"},
        description="Get movie feed filtered by Action and Comedy genres"
    )
    if success and response:
        test_results["movie_feed_with_genres"] = validate_movie_feed_response(response)
    
    # Test 3: Movie Feed with Exclude
    print("\n" + "="*80)
    print("TEST 3: Movie Feed API - With Exclude Parameter")
    print("="*80)
    success, response = test_api_endpoint(
        "GET", 
        "/tmdb/feed", 
        params={"exclude": "123,456"},
        description="Get movie feed excluding specific movie IDs"
    )
    if success and response:
        test_results["movie_feed_with_exclude"] = validate_movie_feed_response(response)
    
    # Test 4: Movie Details - Fight Club (ID: 550)
    print("\n" + "="*80)
    print("TEST 4: Movie Details API - Fight Club (ID: 550)")
    print("="*80)
    success, response = test_api_endpoint(
        "GET", 
        "/tmdb/movie/550", 
        description="Get detailed info for Fight Club (movie ID 550)"
    )
    if success and response:
        test_results["movie_details_fight_club"] = validate_movie_details_response(response)
    
    # Test 5: Movie Details - Inception (ID: 27205)
    print("\n" + "="*80)
    print("TEST 5: Movie Details API - Inception (ID: 27205)")
    print("="*80)
    success, response = test_api_endpoint(
        "GET", 
        "/tmdb/movie/27205", 
        description="Get detailed info for Inception (movie ID 27205)"
    )
    if success and response:
        test_results["movie_details_inception"] = validate_movie_details_response(response)
    
    # Test Summary
    print("\n" + "="*80)
    print("🎯 TEST SUMMARY")
    print("="*80)
    
    total_tests = len(test_results)
    passed_tests = sum(1 for result in test_results.values() if result)
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:<30}: {status}")
    
    print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
    
    if passed_tests == total_tests:
        print("🎉 All tests passed! Both Movie Feed and Movie Details APIs are working correctly.")
        return True
    else:
        print("⚠️  Some tests failed. Please check the issues above.")
        return False

if __name__ == "__main__":
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n❌ Test interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error during testing: {e}")
        sys.exit(1)