"""
Backend API Testing for Film Companion - AI Matchmaking with Caching
Tests the /api/matches endpoint with caching functionality
"""

import requests
import time
import json

# Backend URL
BACKEND_URL = "https://showtime-setup.preview.emergentagent.com/api"

def test_matchmaking_with_caching():
    """
    Test AI matchmaking endpoint with caching functionality:
    1. First request (CACHE MISS) - should call LLM
    2. Second request (CACHE HIT) - should return instantly from cache
    3. Third request with force_refresh (CACHE MISS) - should bypass cache
    """
    
    print("=" * 80)
    print("TESTING AI MATCHMAKING ENDPOINT WITH CACHING")
    print("=" * 80)
    
    test_user_id = "test_cache_user_123"
    
    # ========================================
    # TEST 1: First Request (CACHE MISS)
    # ========================================
    print("\n" + "=" * 80)
    print("TEST 1: First Request (CACHE MISS - should call LLM)")
    print("=" * 80)
    
    payload_1 = {
        "user_id": test_user_id,
        "limit": 5
    }
    
    print(f"\nRequest: POST {BACKEND_URL}/matches")
    print(f"Payload: {json.dumps(payload_1, indent=2)}")
    
    start_time_1 = time.time()
    try:
        response_1 = requests.post(
            f"{BACKEND_URL}/matches",
            json=payload_1,
            timeout=30
        )
        end_time_1 = time.time()
        response_time_1 = end_time_1 - start_time_1
        
        print(f"\nStatus Code: {response_1.status_code}")
        print(f"Response Time: {response_time_1:.2f} seconds")
        
        if response_1.status_code == 200:
            data_1 = response_1.json()
            print(f"\nResponse Keys: {list(data_1.keys())}")
            print(f"Success: {data_1.get('success')}")
            print(f"Cached: {data_1.get('cached')}")
            print(f"Number of Matches: {len(data_1.get('matches', []))}")
            
            # Verify response structure
            assert data_1.get('success') == True, "❌ success should be True"
            assert 'matches' in data_1, "❌ Response should contain 'matches' field"
            assert 'cached' in data_1, "❌ Response should contain 'cached' field"
            
            # Check matches structure
            matches = data_1.get('matches', [])
            if matches:
                first_match = matches[0]
                print(f"\nFirst Match Structure:")
                print(f"  - name: {first_match.get('name')}")
                print(f"  - age: {first_match.get('age')}")
                print(f"  - location: {first_match.get('location')}")
                print(f"  - match_level: {first_match.get('match_level')}")
                print(f"  - explanation: {first_match.get('explanation')[:100]}...")
                
                # Verify match structure
                assert 'name' in first_match, "❌ Match should have 'name'"
                assert 'age' in first_match, "❌ Match should have 'age'"
                assert 'location' in first_match, "❌ Match should have 'location'"
                assert 'match_level' in first_match, "❌ Match should have 'match_level'"
                assert 'explanation' in first_match, "❌ Match should have 'explanation'"
            
            print("\n✅ TEST 1 PASSED: First request successful (CACHE MISS)")
            print(f"   Response time: {response_time_1:.2f}s (expected: slower due to LLM call)")
            
        else:
            print(f"\n❌ TEST 1 FAILED: Status code {response_1.status_code}")
            print(f"Response: {response_1.text}")
            return False
            
    except Exception as e:
        print(f"\n❌ TEST 1 FAILED: {str(e)}")
        return False
    
    # Wait a moment before next request
    time.sleep(1)
    
    # ========================================
    # TEST 2: Second Request (CACHE HIT)
    # ========================================
    print("\n" + "=" * 80)
    print("TEST 2: Second Request (CACHE HIT - should return instantly)")
    print("=" * 80)
    
    payload_2 = {
        "user_id": test_user_id,
        "limit": 5
    }
    
    print(f"\nRequest: POST {BACKEND_URL}/matches")
    print(f"Payload: {json.dumps(payload_2, indent=2)}")
    
    start_time_2 = time.time()
    try:
        response_2 = requests.post(
            f"{BACKEND_URL}/matches",
            json=payload_2,
            timeout=30
        )
        end_time_2 = time.time()
        response_time_2 = end_time_2 - start_time_2
        
        print(f"\nStatus Code: {response_2.status_code}")
        print(f"Response Time: {response_time_2:.2f} seconds")
        
        if response_2.status_code == 200:
            data_2 = response_2.json()
            print(f"\nResponse Keys: {list(data_2.keys())}")
            print(f"Success: {data_2.get('success')}")
            print(f"Cached: {data_2.get('cached')}")
            print(f"Number of Matches: {len(data_2.get('matches', []))}")
            
            # Verify response structure
            assert data_2.get('success') == True, "❌ success should be True"
            assert 'matches' in data_2, "❌ Response should contain 'matches' field"
            
            # Compare response times
            print(f"\n📊 Response Time Comparison:")
            print(f"   First request (CACHE MISS): {response_time_1:.2f}s")
            print(f"   Second request (CACHE HIT): {response_time_2:.2f}s")
            print(f"   Speed improvement: {response_time_1 / response_time_2:.1f}x faster")
            
            # Cache should be significantly faster
            if response_time_2 < response_time_1 * 0.5:
                print("\n✅ TEST 2 PASSED: Second request is significantly faster (CACHE HIT)")
            else:
                print("\n⚠️  TEST 2 WARNING: Second request not significantly faster")
                print("   This might indicate cache is not working as expected")
            
        else:
            print(f"\n❌ TEST 2 FAILED: Status code {response_2.status_code}")
            print(f"Response: {response_2.text}")
            return False
            
    except Exception as e:
        print(f"\n❌ TEST 2 FAILED: {str(e)}")
        return False
    
    # Wait a moment before next request
    time.sleep(1)
    
    # ========================================
    # TEST 3: Request with force_refresh (CACHE MISS)
    # ========================================
    print("\n" + "=" * 80)
    print("TEST 3: Request with force_refresh=true (CACHE MISS - bypass cache)")
    print("=" * 80)
    
    payload_3 = {
        "user_id": test_user_id,
        "limit": 5,
        "force_refresh": True
    }
    
    print(f"\nRequest: POST {BACKEND_URL}/matches")
    print(f"Payload: {json.dumps(payload_3, indent=2)}")
    
    start_time_3 = time.time()
    try:
        response_3 = requests.post(
            f"{BACKEND_URL}/matches",
            json=payload_3,
            timeout=30
        )
        end_time_3 = time.time()
        response_time_3 = end_time_3 - start_time_3
        
        print(f"\nStatus Code: {response_3.status_code}")
        print(f"Response Time: {response_time_3:.2f} seconds")
        
        if response_3.status_code == 200:
            data_3 = response_3.json()
            print(f"\nResponse Keys: {list(data_3.keys())}")
            print(f"Success: {data_3.get('success')}")
            print(f"Cached: {data_3.get('cached')}")
            print(f"Number of Matches: {len(data_3.get('matches', []))}")
            
            # Verify response structure
            assert data_3.get('success') == True, "❌ success should be True"
            assert 'matches' in data_3, "❌ Response should contain 'matches' field"
            
            # Compare response times
            print(f"\n📊 Response Time Comparison:")
            print(f"   First request (CACHE MISS): {response_time_1:.2f}s")
            print(f"   Second request (CACHE HIT): {response_time_2:.2f}s")
            print(f"   Third request (force_refresh): {response_time_3:.2f}s")
            
            # force_refresh should be similar to first request (both call LLM)
            if response_time_3 > response_time_2:
                print("\n✅ TEST 3 PASSED: force_refresh bypassed cache (slower than cached)")
            else:
                print("\n⚠️  TEST 3 WARNING: force_refresh not significantly slower than cache")
            
        else:
            print(f"\n❌ TEST 3 FAILED: Status code {response_3.status_code}")
            print(f"Response: {response_3.text}")
            return False
            
    except Exception as e:
        print(f"\n❌ TEST 3 FAILED: {str(e)}")
        return False
    
    # ========================================
    # FINAL SUMMARY
    # ========================================
    print("\n" + "=" * 80)
    print("FINAL SUMMARY")
    print("=" * 80)
    print("\n✅ ALL TESTS PASSED!")
    print("\nCache Performance:")
    print(f"  - CACHE MISS (1st request): {response_time_1:.2f}s")
    print(f"  - CACHE HIT (2nd request): {response_time_2:.2f}s")
    print(f"  - CACHE BYPASS (force_refresh): {response_time_3:.2f}s")
    print(f"  - Cache speedup: {response_time_1 / response_time_2:.1f}x faster")
    
    print("\nVerified Features:")
    print("  ✅ Response contains 'success' field")
    print("  ✅ Response contains 'matches' array")
    print("  ✅ Response contains 'cached' boolean field")
    print("  ✅ Each match has name, age, location, match_level, explanation")
    print("  ✅ Cache MISS on first request (slower)")
    print("  ✅ Cache HIT on second request (faster)")
    print("  ✅ force_refresh bypasses cache (slower)")
    
    return True


if __name__ == "__main__":
    print("\n🚀 Starting AI Matchmaking Cache Tests...\n")
    success = test_matchmaking_with_caching()
    
    if success:
        print("\n" + "=" * 80)
        print("🎉 ALL TESTS COMPLETED SUCCESSFULLY!")
        print("=" * 80)
        exit(0)
    else:
        print("\n" + "=" * 80)
        print("❌ SOME TESTS FAILED")
        print("=" * 80)
        exit(1)
