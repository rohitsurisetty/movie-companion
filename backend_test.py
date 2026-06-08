#!/usr/bin/env python3
"""
Backend Test Suite for Film Companion Chat Service MongoDB Persistence
Tests all chat endpoints with MongoDB persistence verification
"""

import requests
import time
import json
from typing import Dict, List

# Backend URL from environment
BACKEND_URL = "https://showtime-setup.preview.emergentagent.com/api"

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

def test_1_init_mock_conversations():
    """Test 1: Create test user and initialize mock conversations"""
    print_test("Test 1: Initialize Mock Conversations")
    
    try:
        url = f"{BACKEND_URL}/chat/init-mock/persistence_test_user"
        print_info(f"POST {url}")
        
        response = requests.post(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print_success("Mock conversations initialized successfully")
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

def test_2_get_conversations():
    """Test 2: Get conversations (verify persistence)"""
    print_test("Test 2: Get Conversations - Verify Persistence")
    
    try:
        url = f"{BACKEND_URL}/chat/conversations/persistence_test_user"
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            conversations = data.get("conversations", [])
            
            print_info(f"Response: {json.dumps(data, indent=2)}")
            print_info(f"Found {len(conversations)} conversations")
            
            # Verify we have at least 2 conversations with mock users
            if len(conversations) >= 2:
                print_success(f"Found {len(conversations)} conversations (expected 2+)")
                
                # Check for mock users
                mock_users = ["mock_user_001", "mock_user_002", "mock_user_003"]
                found_mock_users = []
                for conv in conversations:
                    other_user_id = conv.get("other_user_id")
                    if other_user_id in mock_users:
                        found_mock_users.append(other_user_id)
                        print_success(f"  - Conversation with {other_user_id}: {conv.get('last_message', 'No message')[:50]}")
                
                if len(found_mock_users) >= 2:
                    print_success(f"Verified conversations with mock users: {', '.join(found_mock_users)}")
                    return True
                else:
                    print_error(f"Expected conversations with mock users, found: {found_mock_users}")
                    return False
            else:
                print_error(f"Expected at least 2 conversations, found {len(conversations)}")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_3_get_messages():
    """Test 3: Get messages for a conversation"""
    print_test("Test 3: Get Messages for Conversation")
    
    try:
        conversation_id = "mock_user_001_persistence_test_user"
        url = f"{BACKEND_URL}/chat/messages/{conversation_id}"
        print_info(f"GET {url}")
        
        response = requests.get(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            messages = data.get("messages", [])
            
            print_info(f"Found {len(messages)} messages")
            
            if len(messages) > 0:
                print_success(f"Retrieved {len(messages)} messages from conversation")
                
                # Display first few messages
                for i, msg in enumerate(messages[:3]):
                    sender = msg.get("sender_id", "unknown")
                    content = msg.get("content", "")[:50]
                    print_info(f"  Message {i+1}: {sender} -> {content}")
                
                return True
            else:
                print_error("No messages found in conversation")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_4_send_message():
    """Test 4: Send a message"""
    print_test("Test 4: Send Message")
    
    try:
        url = f"{BACKEND_URL}/chat/send"
        payload = {
            "sender_id": "persistence_test_user",
            "receiver_id": "mock_user_001",
            "content": "Testing MongoDB persistence!",
            "message_type": "text"
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get("success"):
                message = data.get("message", {})
                print_success(f"Message sent successfully")
                print_success(f"  Message ID: {message.get('message_id')}")
                print_success(f"  Content: {message.get('content')}")
                print_success(f"  Created at: {message.get('created_at')}")
                return True
            else:
                print_error(f"API returned success=false: {data}")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_5_ai_auto_reply():
    """Test 5: Wait and check for AI auto-reply"""
    print_test("Test 5: AI Auto-Reply (Wait 4 seconds)")
    
    try:
        # Get message count before waiting
        conversation_id = "mock_user_001_persistence_test_user"
        url = f"{BACKEND_URL}/chat/messages/{conversation_id}"
        
        print_info("Getting initial message count...")
        response_before = requests.get(url, timeout=10)
        messages_before = response_before.json().get("messages", []) if response_before.status_code == 200 else []
        count_before = len(messages_before)
        print_info(f"Messages before: {count_before}")
        
        # Wait for AI auto-reply
        print_info("Waiting 4 seconds for AI auto-reply...")
        time.sleep(4)
        
        # Check for new messages
        print_info(f"GET {url}")
        response = requests.get(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            messages = data.get("messages", [])
            count_after = len(messages)
            
            print_info(f"Messages after: {count_after}")
            
            if count_after > count_before:
                # Find the new message(s)
                new_messages = messages[:count_after - count_before]
                
                # Check if any new message is from mock_user_001 (AI reply)
                ai_reply_found = False
                for msg in new_messages:
                    if msg.get("sender_id") == "mock_user_001":
                        ai_reply_found = True
                        print_success(f"AI auto-reply received from mock_user_001")
                        print_success(f"  Content: {msg.get('content')}")
                        print_success(f"  Created at: {msg.get('created_at')}")
                        break
                
                if ai_reply_found:
                    return True
                else:
                    print_error("New messages found but no AI reply from mock_user_001")
                    return False
            else:
                print_error(f"No new messages received (expected AI auto-reply)")
                print_info("Note: AI auto-reply might be disabled or LLM integration issue")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_6_mark_as_read():
    """Test 6: Mark messages as read"""
    print_test("Test 6: Mark Messages as Read")
    
    try:
        conversation_id = "mock_user_001_persistence_test_user"
        user_id = "persistence_test_user"
        url = f"{BACKEND_URL}/chat/read/{conversation_id}?user_id={user_id}"
        
        print_info(f"POST {url}")
        
        response = requests.post(url, timeout=10)
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print_success("Messages marked as read successfully")
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

def test_7_ice_breakers():
    """Test 7: Test ice breakers (LLM integration)"""
    print_test("Test 7: Ice Breakers (LLM Integration)")
    
    try:
        url = f"{BACKEND_URL}/chat/ice-breakers"
        payload = {
            "user_id": "persistence_test_user",
            "match_user_id": "mock_user_001"
        }
        
        print_info(f"POST {url}")
        print_info(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=15)
        print_info(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print_info(f"Response: {json.dumps(data, indent=2)}")
            
            if data.get("success"):
                ice_breakers = data.get("ice_breakers", [])
                if len(ice_breakers) > 0:
                    print_success(f"Received {len(ice_breakers)} ice breakers")
                    for i, icebreaker in enumerate(ice_breakers, 1):
                        print_success(f"  {i}. {icebreaker}")
                    return True
                else:
                    print_error("No ice breakers returned")
                    return False
            else:
                print_error(f"API returned success=false: {data}")
                return False
        else:
            print_error(f"Failed with status {response.status_code}: {response.text}")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def test_8_verify_mongodb_persistence():
    """Test 8: Verify data persistence in MongoDB"""
    print_test("Test 8: Verify MongoDB Persistence")
    
    try:
        print_info("Verifying data persists across multiple requests...")
        
        # Test 1: Get conversations again
        url = f"{BACKEND_URL}/chat/conversations/persistence_test_user"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            conversations = data.get("conversations", [])
            print_success(f"Conversations still accessible: {len(conversations)} found")
        else:
            print_error("Failed to retrieve conversations")
            return False
        
        # Test 2: Get messages again
        conversation_id = "mock_user_001_persistence_test_user"
        url = f"{BACKEND_URL}/chat/messages/{conversation_id}"
        response = requests.get(url, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            messages = data.get("messages", [])
            print_success(f"Messages still accessible: {len(messages)} found")
            
            # Verify our test message is there
            test_message_found = False
            for msg in messages:
                if "Testing MongoDB persistence!" in msg.get("content", ""):
                    test_message_found = True
                    print_success(f"Test message found in persistence: '{msg.get('content')}'")
                    break
            
            if test_message_found:
                print_success("MongoDB persistence verified - data is stored and retrievable")
                return True
            else:
                print_error("Test message not found in persistence")
                return False
        else:
            print_error("Failed to retrieve messages")
            return False
            
    except Exception as e:
        print_error(f"Exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print(f"\n{Colors.BLUE}{'='*80}{Colors.RESET}")
    print(f"{Colors.BLUE}FILM COMPANION - CHAT SERVICE MONGODB PERSISTENCE TESTS{Colors.RESET}")
    print(f"{Colors.BLUE}Backend URL: {BACKEND_URL}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*80}{Colors.RESET}")
    
    results = {}
    
    # Run all tests
    results["Test 1: Init Mock Conversations"] = test_1_init_mock_conversations()
    results["Test 2: Get Conversations"] = test_2_get_conversations()
    results["Test 3: Get Messages"] = test_3_get_messages()
    results["Test 4: Send Message"] = test_4_send_message()
    results["Test 5: AI Auto-Reply"] = test_5_ai_auto_reply()
    results["Test 6: Mark as Read"] = test_6_mark_as_read()
    results["Test 7: Ice Breakers"] = test_7_ice_breakers()
    results["Test 8: Verify MongoDB Persistence"] = test_8_verify_mongodb_persistence()
    
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
