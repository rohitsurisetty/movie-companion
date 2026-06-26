#!/usr/bin/env python3
"""
Backend API Testing for Film Companion App
Tests all backend APIs as per review request
"""

import requests
import time
import json
from typing import Dict, List

# Backend URL from environment
BACKEND_URL = "https://match-history-dev.preview.emergentagent.com/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def print_test(test_name: str):
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}TEST: {test_name}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")

def print_success(message: str):
    print(f"{Colors.GREEN}✓ {message}{Colors.RESET}")

def print_error(message: str):
    print(f"{Colors.RED}✗ {message}{Colors.RESET}")

def print_info(message: str):
    print(f"{Colors.YELLOW}ℹ {message}{Colors.RESET}")

def test_1_send_email_otp():
    """Test 1: Send Email OTP"""
    print_test("Test 1: Send Email OTP")
    
    try:
        url = f"{BACKEND_URL}/auth/send-email-otp"
        payload = {"email": "newuser@test.com"}
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success") and data.get("otp"):
                print_success(f"OTP sent successfully: {data.get('otp')}")
                print_success(f"Is new user: {data.get('is_new_user')}")
                return True, data.get("otp")
            else:
                print_error(f"API returned unexpected response: {data}")
                return False, None
        else:
            print_error(f"Failed with status {response.status_code}")
            return False, None
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False, None

def test_2_verify_otp(otp: str):
    """Test 2: Verify OTP"""
    print_test("Test 2: Verify OTP")
    
    try:
        url = f"{BACKEND_URL}/auth/verify-otp"
        payload = {
            "type": "email",
            "identifier": "newuser@test.com",
            "otp": otp,
            "name": "Test User"
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("user_id") and data.get("session_token"):
                print_success(f"OTP verified successfully")
                print_success(f"User ID: {data.get('user_id')}")
                print_success(f"Session Token: {data.get('session_token')[:20]}...")
                print_success(f"Is new user: {data.get('is_new_user')}")
                return True, data.get("user_id")
            else:
                print_error(f"API returned unexpected response: {data}")
                return False, None
        else:
            print_error(f"Failed with status {response.status_code}")
            return False, None
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False, None

def test_3_tina_greeting():
    """Test 3: Tina AI Greeting"""
    print_test("Test 3: Tina AI Greeting")
    
    try:
        url = f"{BACKEND_URL}/tina/greeting/Alex"
        
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            greeting = data.get("greeting", "")
            
            # Check if greeting starts with "Tina:" (should NOT)
            if greeting.lower().startswith("tina:"):
                print_error(f"❌ CRITICAL: Greeting starts with 'Tina:' prefix: {greeting}")
                return False
            else:
                print_success(f"✓ Greeting does NOT start with 'Tina:' prefix")
                print_success(f"Greeting: {greeting}")
                return True
        else:
            print_error(f"Failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_4_tina_chat():
    """Test 4: Tina AI Chat"""
    print_test("Test 4: Tina AI Chat")
    
    try:
        url = f"{BACKEND_URL}/tina/chat"
        payload = {
            "user_id": "test123",
            "message": "hey looking for something serious",
            "conversation_history": [],
            "current_profile_data": {}
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=15)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            tina_response = data.get("response", "")
            
            # Check if response starts with "Tina:" (should NOT)
            if tina_response.lower().startswith("tina:"):
                print_error(f"❌ CRITICAL: Response starts with 'Tina:' prefix: {tina_response}")
                return False
            else:
                print_success(f"✓ Response does NOT start with 'Tina:' prefix")
                print_success(f"Response: {tina_response}")
                print_success(f"Is conversation ended: {data.get('conversation_ended')}")
                return True
        else:
            print_error(f"Failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_5_feed_matches():
    """Test 5: Feed/Matchmaking API"""
    print_test("Test 5: Feed/Matchmaking API")
    
    try:
        url = f"{BACKEND_URL}/matches"
        payload = {
            "user_id": "test123",
            "force_refresh": False
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=30)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text[:500]}...")
        
        if response.status_code == 200:
            data = response.json()
            matches = data.get("matches", [])
            
            if len(matches) > 0:
                print_success(f"Found {len(matches)} matches")
                
                # Check if matches have images
                has_images = all(match.get("picture") for match in matches)
                if has_images:
                    print_success(f"✓ All matches have profile images")
                else:
                    print_info(f"Some matches may not have profile images (expected for mock data)")
                
                # Display first match
                first_match = matches[0]
                print_info(f"First match: {first_match.get('name')}, {first_match.get('age')}, {first_match.get('location')}")
                return True
            else:
                print_error("No matches returned")
                return False
        else:
            print_error(f"Failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_6_conversations():
    """Test 6: Get Conversations"""
    print_test("Test 6: Get Conversations")
    
    try:
        url = f"{BACKEND_URL}/chat/conversations/test123"
        
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text[:500]}...")
        
        if response.status_code == 200:
            data = response.json()
            conversations = data.get("conversations", [])
            
            print_success(f"Found {len(conversations)} conversations")
            
            if len(conversations) > 0:
                # Display first conversation
                first_conv = conversations[0]
                print_info(f"First conversation: {first_conv.get('other_user_name')}")
                print_info(f"Last message: {first_conv.get('last_message', '')[:50]}")
                return True
            else:
                print_info("No conversations found (expected for new user)")
                return True
        else:
            print_error(f"Failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_7_send_chat_message():
    """Test 7: Send Chat Message"""
    print_test("Test 7: Send Chat Message")
    
    try:
        url = f"{BACKEND_URL}/chat/send"
        payload = {
            "sender_id": "test123",
            "receiver_id": "mock_user_001",
            "content": "Hey! What's your favorite movie?",
            "message_type": "text"
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                message = data.get("message", {})
                print_success(f"Message sent successfully")
                print_success(f"Message ID: {message.get('message_id')}")
                print_success(f"Content: {message.get('content')}")
                return True
            else:
                print_error(f"API returned success=false: {data}")
                return False
        else:
            print_error(f"Failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_8_user_pictures():
    """Test 8: Get User Pictures"""
    print_test("Test 8: Get User Pictures")
    
    try:
        url = f"{BACKEND_URL}/user/pictures/test123"
        
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            pictures = data.get("pictures", {})
            
            # Pictures is a dict with picture_1, picture_2, etc.
            if isinstance(pictures, dict):
                picture_count = data.get("count", 0)
                print_success(f"Pictures endpoint working correctly")
                print_info(f"Picture count: {picture_count}")
                
                # Display pictures if any
                for key, value in pictures.items():
                    if value:
                        print_info(f"{key}: {value[:50]}...")
                    else:
                        print_info(f"{key}: None (no picture uploaded)")
                
                return True
            else:
                print_error(f"Unexpected pictures format: {type(pictures)}")
                return False
        else:
            print_error(f"Failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}FILM COMPANION - BACKEND API TESTING{Colors.RESET}")
    print(f"{Colors.BLUE}Backend URL: {BACKEND_URL}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
    
    results = {}
    otp = None
    user_id = None
    
    # Test 1: Send Email OTP
    success, otp = test_1_send_email_otp()
    results["Test 1: Send Email OTP"] = success
    
    # Test 2: Verify OTP (only if Test 1 passed)
    if success and otp:
        success, user_id = test_2_verify_otp(otp)
        results["Test 2: Verify OTP"] = success
    else:
        results["Test 2: Verify OTP"] = False
        print_error("Skipping Test 2 - OTP not available")
    
    # Test 3: Tina Greeting
    results["Test 3: Tina AI Greeting"] = test_3_tina_greeting()
    
    # Test 4: Tina Chat
    results["Test 4: Tina AI Chat"] = test_4_tina_chat()
    
    # Test 5: Feed Matches
    results["Test 5: Feed/Matchmaking API"] = test_5_feed_matches()
    
    # Test 6: Conversations
    results["Test 6: Get Conversations"] = test_6_conversations()
    
    # Test 7: Send Chat Message
    results["Test 7: Send Chat Message"] = test_7_send_chat_message()
    
    # Test 8: User Pictures
    results["Test 8: Get User Pictures"] = test_8_user_pictures()
    
    # Print summary
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}TEST SUMMARY{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    for test_name, result in results.items():
        status = f"{Colors.GREEN}PASS{Colors.RESET}" if result else f"{Colors.RED}FAIL{Colors.RESET}"
        print(f"{status} - {test_name}")
    
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    if passed == total:
        print(f"{Colors.GREEN}ALL TESTS PASSED: {passed}/{total}{Colors.RESET}")
    else:
        print(f"{Colors.YELLOW}TESTS PASSED: {passed}/{total}{Colors.RESET}")
        print(f"{Colors.RED}TESTS FAILED: {total - passed}/{total}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}\n")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
