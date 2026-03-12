"""
Backend API tests for Film Companion MVP
Tests: Mock auth, TMDB search, Google Places API integration
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')


class TestHealthCheck:
    """Health check and basic API connectivity"""

    def test_api_root(self):
        """Test API root endpoint returns success"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API root working: {data}")


class TestMockAuth:
    """Mock authentication flow (email/phone/apple)"""

    def test_mock_login_creates_user(self):
        """Test mock login creates user and returns session token"""
        payload = {
            "email": "TEST_playwright_user@mock.com",
            "name": "TEST Playwright User"
        }
        response = requests.post(f"{BASE_URL}/api/auth/mock-login", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "user_id" in data
        assert "session_token" in data
        assert data["email"] == payload["email"]
        assert data["name"] == payload["name"]
        print(f"✓ Mock login successful: user_id={data['user_id']}")

    def test_mock_login_existing_user(self):
        """Test mock login returns existing user if email exists"""
        payload = {
            "email": "TEST_existing_user@mock.com",
            "name": "TEST Existing User"
        }
        # First login
        response1 = requests.post(f"{BASE_URL}/api/auth/mock-login", json=payload)
        assert response1.status_code == 200
        user_id_1 = response1.json()["user_id"]
        
        # Second login with same email
        response2 = requests.post(f"{BASE_URL}/api/auth/mock-login", json=payload)
        assert response2.status_code == 200
        user_id_2 = response2.json()["user_id"]
        
        assert user_id_1 == user_id_2
        print(f"✓ Existing user returned same user_id: {user_id_1}")


class TestTMDBIntegration:
    """TMDB movie search API"""

    def test_tmdb_search_returns_results(self):
        """Test TMDB search returns movie results"""
        response = requests.get(f"{BASE_URL}/api/tmdb/search?query=inception")
        assert response.status_code == 200
        
        data = response.json()
        assert "results" in data
        assert len(data["results"]) > 0
        
        first_movie = data["results"][0]
        assert "id" in first_movie
        assert "title" in first_movie
        assert "poster_path" in first_movie
        print(f"✓ TMDB search returned {len(data['results'])} movies")

    def test_tmdb_search_with_empty_query(self):
        """Test TMDB search with short query"""
        response = requests.get(f"{BASE_URL}/api/tmdb/search?query=a")
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        print(f"✓ TMDB search handles short queries")

    def test_tmdb_search_with_special_chars(self):
        """Test TMDB search with special characters"""
        response = requests.get(f"{BASE_URL}/api/tmdb/search?query=3%20idiots")
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        print(f"✓ TMDB search handles special characters")


class TestGooglePlacesIntegration:
    """Google Places API for location search"""

    def test_places_autocomplete_returns_predictions(self):
        """Test Google Places autocomplete returns city predictions"""
        response = requests.get(f"{BASE_URL}/api/places/autocomplete?input=mumbai")
        assert response.status_code == 200
        
        data = response.json()
        assert "predictions" in data
        assert len(data["predictions"]) > 0
        
        first_prediction = data["predictions"][0]
        assert "description" in first_prediction
        assert "place_id" in first_prediction
        print(f"✓ Places autocomplete returned {len(data['predictions'])} predictions")

    def test_places_geocode_returns_location(self):
        """Test Google Places reverse geocode returns location from coordinates"""
        # Mumbai coordinates
        response = requests.get(f"{BASE_URL}/api/places/geocode?lat=19.0760&lng=72.8777")
        assert response.status_code == 200
        
        data = response.json()
        assert "location" in data
        assert "formatted_address" in data
        print(f"✓ Reverse geocode returned: {data['location']}")


@pytest.fixture
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session
