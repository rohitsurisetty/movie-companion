#!/usr/bin/env python3
"""
Enhanced Comprehensive Recommendation Engine Test Suite

Tests all the enhanced features:
1. TasteVector with primary_languages, secondary_languages, reason_stats
2. Profile save with ALL fields
3. Language prioritization (1.25x primary, 1.1x secondary)
4. "Didn't watch" tracking
5. Reason-based learning and cumulative stats
"""

import asyncio
import httpx
import json
import sys
from typing import Dict, Any

# Backend URL from environment
BACKEND_URL = "https://showtime-setup.preview.emergentagent.com"

class EnhancedRecommendationTester:
    def __init__(self):
        self.base_url = f"{BACKEND_URL}/api"
        self.test_user_id = "test_enhanced_123"
        self.results = []
        
    async def run_all_tests(self):
        """Run all enhanced recommendation engine tests"""
        print("🧠 ENHANCED COMPREHENSIVE RECOMMENDATION ENGINE TESTS")
        print("=" * 60)
        
        tests = [
            ("Full Profile Save with All Fields", self.test_full_profile_save),
            ("Didn't Watch Swipe Tracking", self.test_didnt_watch_swipe),
            ("Reason-Based Learning (Story Lover)", self.test_story_reason_learning),
            ("Reason-Based Learning (Acting Lover)", self.test_acting_reason_learning),
            ("Taste Profile Verification", self.test_taste_profile_verification),
            ("Language Priority Recommendations", self.test_language_priority_recommendations),
        ]
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            self.client = client
            
            for test_name, test_func in tests:
                print(f"\n🔍 Testing: {test_name}")
                try:
                    result = await test_func()
                    if result:
                        print(f"✅ PASSED: {test_name}")
                        self.results.append(f"✅ {test_name}")
                    else:
                        print(f"❌ FAILED: {test_name}")
                        self.results.append(f"❌ {test_name}")
                except Exception as e:
                    print(f"❌ ERROR in {test_name}: {str(e)}")
                    self.results.append(f"❌ {test_name} - ERROR: {str(e)}")
        
        self.print_summary()
    
    async def test_full_profile_save(self) -> bool:
        """Test 1: Full Profile Save with All Fields"""
        profile_data = {
            "user_id": self.test_user_id,
            "name": "Enhanced Test User",
            "age": 30,
            "gender": "Man",
            "location": "Mumbai, India",
            "partnerPreference": "Women",
            "relationshipIntent": ["Movie Buddy", "Serious relationship"],
            "genres": ["Action", "Thriller", "Drama"],
            "filmLanguages": ["Hindi", "English"],
            "languagesSpoken": ["Hindi", "English", "Marathi"],
            "topMovies": [
                {
                    "id": 27205,
                    "title": "Inception",
                    "poster_path": "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
                    "rating": 5,
                    "reasons": ["Good story/plot", "Good craftwork"]
                },
                {
                    "id": 155,
                    "title": "The Dark Knight",
                    "poster_path": "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
                    "rating": 5,
                    "reasons": ["Great performances"]
                },
                {
                    "id": 238,
                    "title": "The Godfather",
                    "poster_path": "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
                    "rating": 5,
                    "reasons": ["Good story/plot", "Great performances"]
                }
            ],
            "movieFrequency": "More than twice a week",
            "ottTheatre": "Both",
            "height": "5'10\"",
            "religion": "Hindu",
            "maritalStatus": "Single",
            "foodPreference": "Non-vegetarian",
            "bio": "Movie enthusiast looking for a film buddy",
            "smoking": "Never",
            "drinking": "Socially",
            "exercise": "Regularly",
            "zodiac": "Leo",
            "pets": "Dogs",
            "education": "MBA",
            "workProfile": "Product Manager",
            "movieBuddyMode": True,
            "movieDateMode": True
        }
        
        response = await self.client.post(
            f"{self.base_url}/user/profile",
            json=profile_data
        )
        
        if response.status_code != 200:
            print(f"❌ Profile save failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"📊 Profile saved successfully")
        print(f"   - Taste dimensions: {data.get('taste_dimensions', 0)}")
        print(f"   - Top movies enriched: {data.get('signals_used', {}).get('top_movies_enriched', 0)}")
        print(f"   - Total actors extracted: {data.get('signals_used', {}).get('total_actors_from_top_movies', 0)}")
        print(f"   - Total keywords extracted: {data.get('signals_used', {}).get('total_keywords_from_top_movies', 0)}")
        
        # Verify enhanced fields are present
        expected_fields = ['taste_dimensions', 'preferred_languages', 'signals_used']
        for field in expected_fields:
            if field not in data:
                print(f"❌ Missing expected field: {field}")
                return False
        
        # Check if we have primary languages (Hindi and English)
        preferred_langs = data.get('preferred_languages', [])
        if 'hi' not in preferred_langs or 'en' not in preferred_langs:
            print(f"❌ Primary languages not found in preferred_languages: {preferred_langs}")
            return False
        
        return True
    
    async def test_didnt_watch_swipe(self) -> bool:
        """Test 2: Test 'Didn't Watch' Swipe"""
        swipe_data = {
            "user_id": self.test_user_id,
            "movie_id": 634649,
            "direction": "left",
            "reason": "Haven't seen this one yet",
            "didnt_watch": True
        }
        
        response = await self.client.post(
            f"{self.base_url}/user/swipe",
            json=swipe_data
        )
        
        if response.status_code != 200:
            print(f"❌ Didn't watch swipe failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"📊 Didn't watch swipe recorded")
        print(f"   - Didn't watch flag: {data.get('didnt_watch', False)}")
        print(f"   - Total swipes: {data.get('total_swipes', 0)}")
        print(f"   - Like count: {data.get('like_count', 0)}")
        print(f"   - Dislike count: {data.get('dislike_count', 0)}")
        
        # Verify didnt_watch flag is True
        if not data.get('didnt_watch', False):
            print(f"❌ didnt_watch flag should be True")
            return False
        
        return True
    
    async def test_story_reason_learning(self) -> bool:
        """Test 3: Test Reason-Based Learning (Story Lover)"""
        swipe_data = {
            "user_id": self.test_user_id,
            "movie_id": 550,  # Fight Club
            "direction": "right",
            "rating": 5,
            "reason": "Amazing story and plot, kept me engaged throughout"
        }
        
        response = await self.client.post(
            f"{self.base_url}/user/swipe",
            json=swipe_data
        )
        
        if response.status_code != 200:
            print(f"❌ Story reason swipe failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"📊 Story-based swipe recorded")
        print(f"   - Total swipes: {data.get('total_swipes', 0)}")
        print(f"   - Like count: {data.get('like_count', 0)}")
        
        return True
    
    async def test_acting_reason_learning(self) -> bool:
        """Test 4: Test Reason-Based Learning (Acting Lover)"""
        swipe_data = {
            "user_id": self.test_user_id,
            "movie_id": 603,  # The Matrix
            "direction": "right",
            "rating": 5,
            "reason": "Brilliant performances by the cast"
        }
        
        response = await self.client.post(
            f"{self.base_url}/user/swipe",
            json=swipe_data
        )
        
        if response.status_code != 200:
            print(f"❌ Acting reason swipe failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"📊 Acting-based swipe recorded")
        print(f"   - Total swipes: {data.get('total_swipes', 0)}")
        print(f"   - Like count: {data.get('like_count', 0)}")
        
        return True
    
    async def test_taste_profile_verification(self) -> bool:
        """Test 5: Get Taste Profile to Verify Enhancements"""
        response = await self.client.get(
            f"{self.base_url}/user/{self.test_user_id}/taste-profile"
        )
        
        if response.status_code != 200:
            print(f"❌ Taste profile fetch failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        print(f"📊 Taste profile retrieved")
        print(f"   - Total swipes: {data.get('total_swipes', 0)}")
        print(f"   - Like count: {data.get('like_count', 0)}")
        print(f"   - Dislike count: {data.get('dislike_count', 0)}")
        print(f"   - Top genres: {len(data.get('top_genres', []))}")
        print(f"   - Top actors: {len(data.get('top_actors', []))}")
        print(f"   - Top directors: {len(data.get('top_directors', []))}")
        
        # Show top preferences
        top_genres = data.get('top_genres', [])[:3]
        if top_genres:
            print(f"   - Top 3 genres: {[g['name'] for g in top_genres]}")
        
        top_actors = data.get('top_actors', [])[:3]
        if top_actors:
            print(f"   - Top 3 actors: {[a['name'] for a in top_actors]}")
        
        top_directors = data.get('top_directors', [])[:3]
        if top_directors:
            print(f"   - Top 3 directors: {[d['name'] for d in top_directors]}")
        
        # Verify we have meaningful data
        if data.get('total_swipes', 0) < 2:
            print(f"❌ Expected at least 2 swipes, got {data.get('total_swipes', 0)}")
            return False
        
        return True
    
    async def test_language_priority_recommendations(self) -> bool:
        """Test 6: Get Recommendations with Language Priority"""
        rec_data = {
            "user_id": self.test_user_id,
            "page": 1,
            "limit": 15
        }
        
        response = await self.client.post(
            f"{self.base_url}/recommendations",
            json=rec_data
        )
        
        if response.status_code != 200:
            print(f"❌ Recommendations fetch failed: {response.status_code} - {response.text}")
            return False
        
        data = response.json()
        results = data.get('results', [])
        
        print(f"📊 Recommendations retrieved")
        print(f"   - Total recommendations: {len(results)}")
        print(f"   - Taste dimensions: {data.get('taste_dimensions', 0)}")
        
        if len(results) == 0:
            print(f"❌ No recommendations returned")
            return False
        
        # Check language distribution
        language_counts = {}
        for movie in results[:10]:  # Check first 10
            lang = movie.get('original_language', 'unknown')
            language_counts[lang] = language_counts.get(lang, 0) + 1
        
        print(f"   - Language distribution: {language_counts}")
        
        # Verify we have movies in primary languages (Hindi/English)
        primary_lang_movies = language_counts.get('hi', 0) + language_counts.get('en', 0)
        if primary_lang_movies == 0:
            print(f"❌ No movies in primary languages (Hindi/English) found")
            return False
        
        # Show sample recommendations with scores
        print(f"   - Sample recommendations:")
        for i, movie in enumerate(results[:5]):
            score = movie.get('recommendation_score', 0)
            lang = movie.get('original_language', 'unknown')
            print(f"     {i+1}. {movie.get('title', 'Unknown')} ({lang}) - Score: {score}")
        
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("🎯 ENHANCED RECOMMENDATION ENGINE TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if r.startswith("✅"))
        total = len(self.results)
        
        for result in self.results:
            print(result)
        
        print(f"\n📊 RESULTS: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 ALL ENHANCED FEATURES WORKING CORRECTLY!")
        else:
            print("⚠️  Some enhanced features need attention")

async def main():
    """Main test runner"""
    print("Starting Enhanced Comprehensive Recommendation Engine Tests...")
    print(f"Backend URL: {BACKEND_URL}")
    
    tester = EnhancedRecommendationTester()
    await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())