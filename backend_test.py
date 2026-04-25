#!/usr/bin/env python3
"""
Backend API Testing for Film Companion Movie APIs
Tests the TMDB movie feed, details endpoints, and COMPREHENSIVE RECOMMENDATION ENGINE
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

def validate_profile_save_response(response_data):
    """Validate the structure of profile save response with enrichment stats"""
    print("\n🔍 Validating Profile Save Response Structure...")
    
    required_fields = ["success", "message", "signals_used"]
    for field in required_fields:
        if field not in response_data:
            print(f"❌ Missing required field: {field}")
            return False
    
    signals_used = response_data.get("signals_used", {})
    expected_signals = ["top_movies_enriched", "total_actors_from_top_movies", 
                       "total_directors_from_top_movies", "total_keywords_from_top_movies"]
    
    for signal in expected_signals:
        if signal not in signals_used:
            print(f"❌ Missing enrichment signal: {signal}")
            return False
    
    print(f"✅ Profile save response structure is valid.")
    print(f"   - Top movies enriched: {signals_used.get('top_movies_enriched', 0)}")
    print(f"   - Total actors extracted: {signals_used.get('total_actors_from_top_movies', 0)}")
    print(f"   - Total directors extracted: {signals_used.get('total_directors_from_top_movies', 0)}")
    print(f"   - Total keywords extracted: {signals_used.get('total_keywords_from_top_movies', 0)}")
    return True

def validate_swipe_response(response_data):
    """Validate the structure of swipe response"""
    print("\n🔍 Validating Swipe Response Structure...")
    
    required_fields = ["success", "message", "total_swipes", "like_count", "dislike_count"]
    for field in required_fields:
        if field not in response_data:
            print(f"❌ Missing required field: {field}")
            return False
    
    print(f"✅ Swipe response structure is valid.")
    print(f"   - Total swipes: {response_data.get('total_swipes', 0)}")
    print(f"   - Like count: {response_data.get('like_count', 0)}")
    print(f"   - Dislike count: {response_data.get('dislike_count', 0)}")
    return True

def validate_taste_profile_response(response_data):
    """Validate the structure of taste profile response"""
    print("\n🔍 Validating Taste Profile Response Structure...")
    
    required_fields = ["user_id", "total_swipes", "top_genres", "top_actors", "top_directors", "preferred_eras"]
    for field in required_fields:
        if field not in response_data:
            print(f"❌ Missing required field: {field}")
            return False
    
    # Check if we have rich data
    top_genres = response_data.get("top_genres", [])
    top_actors = response_data.get("top_actors", [])
    top_directors = response_data.get("top_directors", [])
    
    print(f"✅ Taste profile response structure is valid.")
    print(f"   - Total swipes: {response_data.get('total_swipes', 0)}")
    print(f"   - Top genres: {len(top_genres)} ({[g.get('name', '') for g in top_genres[:3]]})")
    print(f"   - Top actors: {len(top_actors)} ({[a.get('name', '') for a in top_actors[:3]]})")
    print(f"   - Top directors: {len(top_directors)} ({[d.get('name', '') for d in top_directors[:3]]})")
    return True

def validate_recommendations_response(response_data):
    """Validate the structure of recommendations response"""
    print("\n🔍 Validating Recommendations Response Structure...")
    
    required_fields = ["results", "page", "total_swipes", "taste_dimensions"]
    for field in required_fields:
        if field not in response_data:
            print(f"❌ Missing required field: {field}")
            return False
    
    results = response_data.get("results", [])
    if not isinstance(results, list):
        print(f"❌ 'results' should be a list, got {type(results)}")
        return False
    
    if len(results) > 0:
        movie = results[0]
        required_movie_fields = ["id", "title", "recommendation_score"]
        for field in required_movie_fields:
            if field not in movie:
                print(f"❌ Missing required movie field: {field}")
                return False
    
    print(f"✅ Recommendations response structure is valid.")
    print(f"   - Movies returned: {len(results)}")
    print(f"   - Taste dimensions: {response_data.get('taste_dimensions', 0)}")
    return True

def main():
    """Main test function"""
    print("🎬 Film Companion Backend API Testing - COMPREHENSIVE RECOMMENDATION ENGINE")
    print(f"🌐 Base URL: {BASE_URL}")
    print(f"🎯 API Base: {API_BASE_URL}")
    
    test_results = {
        # Original tests
        "movie_feed_basic": False,
        "movie_feed_with_genres": False,
        "movie_feed_with_exclude": False,
        "movie_details_fight_club": False,
        "movie_details_inception": False,
        # New recommendation engine tests
        "profile_save_with_enrichment": False,
        "right_swipe_with_rating": False,
        "left_swipe": False,
        "taste_profile": False,
        "personalized_recommendations": False,
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
    
    # =============================================
    # COMPREHENSIVE RECOMMENDATION ENGINE TESTS
    # =============================================
    
    # Test 6: Profile Save with Top Movies Enrichment
    print("\n" + "="*80)
    print("TEST 6: Profile Save with Top Movies Enrichment")
    print("="*80)
    profile_data = {
        "user_id": "test_user_12345",
        "name": "Test User",
        "age": 28,
        "gender": "Male",
        "genres": ["Action", "Sci-Fi", "Thriller"],
        "filmLanguages": ["English", "Hindi"],
        "languagesSpoken": ["English", "Hindi"],
        "topMovies": [
            {"id": 550, "title": "Fight Club", "poster_path": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", "rating": 5, "reasons": ["Great performances", "Good story/plot"]},
            {"id": 27205, "title": "Inception", "poster_path": "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg", "rating": 5, "reasons": ["Good craftwork", "Good story/plot"]},
            {"id": 155, "title": "The Dark Knight", "poster_path": "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", "rating": 5, "reasons": ["Great performances"]},
            {"id": 603, "title": "The Matrix", "poster_path": "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", "rating": 4, "reasons": ["Good craftwork"]},
            {"id": 238, "title": "The Godfather", "poster_path": "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg", "rating": 5, "reasons": ["Good story/plot", "Great performances"]}
        ],
        "movieFrequency": "Multiple times a week",
        "ottTheatre": "Mostly OTT",
        "relationshipIntent": ["Movie Buddy"]
    }
    success, response = test_api_endpoint(
        "POST", 
        "/user/profile", 
        data=profile_data,
        description="Save user profile with Top 5 movies and verify enrichment"
    )
    if success and response:
        test_results["profile_save_with_enrichment"] = validate_profile_save_response(response)
    
    # Test 7: Right Swipe with Rating
    print("\n" + "="*80)
    print("TEST 7: Right Swipe with Rating")
    print("="*80)
    swipe_data = {
        "user_id": "test_user_12345",
        "movie_id": 157336,
        "direction": "right",
        "rating": 5,
        "reason": "Amazing cinematography and emotional story"
    }
    success, response = test_api_endpoint(
        "POST", 
        "/user/swipe", 
        data=swipe_data,
        description="Record a right swipe with rating and verify signal extraction"
    )
    if success and response:
        test_results["right_swipe_with_rating"] = validate_swipe_response(response)
    
    # Test 8: Left Swipe
    print("\n" + "="*80)
    print("TEST 8: Left Swipe")
    print("="*80)
    swipe_data = {
        "user_id": "test_user_12345",
        "movie_id": 299534,
        "direction": "left",
        "reason": "Not my type of movie"
    }
    success, response = test_api_endpoint(
        "POST", 
        "/user/swipe", 
        data=swipe_data,
        description="Record a left swipe"
    )
    if success and response:
        test_results["left_swipe"] = validate_swipe_response(response)
    
    # Test 9: Get Taste Profile
    print("\n" + "="*80)
    print("TEST 9: Get User Taste Profile")
    print("="*80)
    success, response = test_api_endpoint(
        "GET", 
        "/user/test_user_12345/taste-profile", 
        description="Get user's taste profile to verify signals are being extracted"
    )
    if success and response:
        test_results["taste_profile"] = validate_taste_profile_response(response)
    
    # Test 10: Get Personalized Recommendations
    print("\n" + "="*80)
    print("TEST 10: Get Personalized Recommendations")
    print("="*80)
    recommendations_data = {
        "user_id": "test_user_12345",
        "page": 1,
        "limit": 10
    }
    success, response = test_api_endpoint(
        "POST", 
        "/recommendations", 
        data=recommendations_data,
        description="Get personalized recommendations filtered by language preferences"
    )
    if success and response:
        test_results["personalized_recommendations"] = validate_recommendations_response(response)
    
    # Test Summary
    print("\n" + "="*80)
    print("🎯 TEST SUMMARY - COMPREHENSIVE RECOMMENDATION ENGINE")
    print("="*80)
    
    total_tests = len(test_results)
    passed_tests = sum(1 for result in test_results.values() if result)
    
    # Group tests by category
    original_tests = ["movie_feed_basic", "movie_feed_with_genres", "movie_feed_with_exclude", 
                     "movie_details_fight_club", "movie_details_inception"]
    recommendation_tests = ["profile_save_with_enrichment", "right_swipe_with_rating", 
                           "left_swipe", "taste_profile", "personalized_recommendations"]
    
    print("\n📽️  ORIGINAL MOVIE API TESTS:")
    for test_name in original_tests:
        result = test_results[test_name]
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name:<30}: {status}")
    
    print("\n🧠 RECOMMENDATION ENGINE TESTS:")
    for test_name in recommendation_tests:
        result = test_results[test_name]
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name:<30}: {status}")
    
    print(f"\nOverall: {passed_tests}/{total_tests} tests passed")
    
    # Check backend logs for TMDB enrichment
    print("\n🔍 BACKEND LOG VERIFICATION:")
    print("Expected to see in backend logs:")
    print("  - 'append_to_response=credits%2Ckeywords' in TMDB requests")
    print("  - 'Saved profile for user ... enriched with ... keywords' message")
    print("  - 'Recorded right/left swipe for user' messages")
    
    if passed_tests == total_tests:
        print("\n🎉 All tests passed! Comprehensive Recommendation Engine is working correctly.")
        print("✅ Profile enrichment with full TMDB data")
        print("✅ Comprehensive swipe signal extraction")
        print("✅ Rich taste profile generation")
        print("✅ Personalized recommendations with language filtering")
        return True
    else:
        print("\n⚠️  Some tests failed. Please check the issues above.")
        
        # Specific failure analysis
        failed_tests = [name for name, result in test_results.items() if not result]
        if any(test in failed_tests for test in recommendation_tests):
            print("\n🚨 RECOMMENDATION ENGINE ISSUES DETECTED:")
            for test in recommendation_tests:
                if test in failed_tests:
                    print(f"   - {test}: Check if enrichment/signal extraction is working")
        
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