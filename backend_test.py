#!/usr/bin/env python3
"""
Backend Testing Script for Film Companion OTP Authentication
Tests all OTP authentication endpoints as specified in the review request.
"""

import requests
import json
import time
import sys
from typing import Dict, Any, Optional

# Backend URL from environment
BACKEND_URL = "https://showtime-setup.preview.emergentagent.com"

class OTPAuthTester:
    def __init__(self):
        self.base_url = f"{BACKEND_URL}/api"
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str, response_data: Optional[Dict] = None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        print(f"   Details: {details}")
        if response_data:
            print(f"   Response: {json.dumps(response_data, indent=2)}")
        print()

    def test_send_email_otp(self) -> Optional[str]:
        """Test POST /api/auth/send-email-otp"""
        test_email = "test@filmcompanion.com"
        
        try:
            response = self.session.post(
                f"{self.base_url}/auth/send-email-otp",
                json={"email": test_email},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["success", "is_new_user", "otp"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test(
                        "Send Email OTP",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return None
                
                # Check OTP format (6-digit number)
                otp = data.get("otp", "")
                if not (isinstance(otp, str) and otp.isdigit() and len(otp) == 6):
                    self.log_test(
                        "Send Email OTP",
                        False,
                        f"OTP format invalid. Expected 6-digit string, got: {otp}",
                        data
                    )
                    return None
                
                self.log_test(
                    "Send Email OTP",
                    True,
                    f"Successfully sent OTP to {test_email}. OTP: {otp}, is_new_user: {data['is_new_user']}",
                    data
                )
                return otp
                
            else:
                self.log_test(
                    "Send Email OTP",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    None
                )
                return None
                
        except Exception as e:
            self.log_test(
                "Send Email OTP",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return None

    def test_send_phone_otp(self) -> Optional[str]:
        """Test POST /api/auth/send-phone-otp"""
        test_phone = "+919876543210"
        
        try:
            response = self.session.post(
                f"{self.base_url}/auth/send-phone-otp",
                json={"phone": test_phone},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                required_fields = ["success", "is_new_user", "otp"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test(
                        "Send Phone OTP",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return None
                
                # Check OTP format (6-digit number)
                otp = data.get("otp", "")
                if not (isinstance(otp, str) and otp.isdigit() and len(otp) == 6):
                    self.log_test(
                        "Send Phone OTP",
                        False,
                        f"OTP format invalid. Expected 6-digit string, got: {otp}",
                        data
                    )
                    return None
                
                self.log_test(
                    "Send Phone OTP",
                    True,
                    f"Successfully sent OTP to {test_phone}. OTP: {otp}, is_new_user: {data['is_new_user']}",
                    data
                )
                return otp
                
            else:
                self.log_test(
                    "Send Phone OTP",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    None
                )
                return None
                
        except Exception as e:
            self.log_test(
                "Send Phone OTP",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return None

    def test_verify_otp_new_user(self) -> Optional[str]:
        """Test POST /api/auth/verify-otp for new user with email"""
        # First get OTP
        new_user_email = "newuser@test.com"
        
        try:
            # Send OTP first
            otp_response = self.session.post(
                f"{self.base_url}/auth/send-email-otp",
                json={"email": new_user_email},
                headers={"Content-Type": "application/json"}
            )
            
            if otp_response.status_code != 200:
                self.log_test(
                    "Verify OTP (New User)",
                    False,
                    f"Failed to send OTP: HTTP {otp_response.status_code}",
                    None
                )
                return None
            
            otp_data = otp_response.json()
            otp = otp_data.get("otp")
            
            if not otp:
                self.log_test(
                    "Verify OTP (New User)",
                    False,
                    "No OTP received from send-email-otp",
                    otp_data
                )
                return None
            
            # Now verify OTP with name
            verify_response = self.session.post(
                f"{self.base_url}/auth/verify-otp",
                json={
                    "type": "email",
                    "identifier": new_user_email,
                    "otp": otp,
                    "name": "Test User"
                },
                headers={"Content-Type": "application/json"}
            )
            
            if verify_response.status_code == 200:
                data = verify_response.json()
                
                # Check required fields for new user
                required_fields = ["user_id", "session_token", "is_new_user"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test(
                        "Verify OTP (New User)",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return None
                
                # Check is_new_user is True
                if not data.get("is_new_user"):
                    self.log_test(
                        "Verify OTP (New User)",
                        False,
                        f"Expected is_new_user=True, got: {data.get('is_new_user')}",
                        data
                    )
                    return None
                
                user_id = data.get("user_id")
                self.log_test(
                    "Verify OTP (New User)",
                    True,
                    f"Successfully created new user. user_id: {user_id}, session_token: {data.get('session_token')[:20]}...",
                    data
                )
                return user_id
                
            else:
                self.log_test(
                    "Verify OTP (New User)",
                    False,
                    f"HTTP {verify_response.status_code}: {verify_response.text}",
                    None
                )
                return None
                
        except Exception as e:
            self.log_test(
                "Verify OTP (New User)",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return None

    def test_verify_otp_existing_user(self, existing_email: str = "newuser@test.com") -> Optional[str]:
        """Test POST /api/auth/verify-otp for existing user"""
        try:
            # Send OTP to existing user
            otp_response = self.session.post(
                f"{self.base_url}/auth/send-email-otp",
                json={"email": existing_email},
                headers={"Content-Type": "application/json"}
            )
            
            if otp_response.status_code != 200:
                self.log_test(
                    "Verify OTP (Existing User)",
                    False,
                    f"Failed to send OTP: HTTP {otp_response.status_code}",
                    None
                )
                return None
            
            otp_data = otp_response.json()
            otp = otp_data.get("otp")
            
            if not otp:
                self.log_test(
                    "Verify OTP (Existing User)",
                    False,
                    "No OTP received from send-email-otp",
                    otp_data
                )
                return None
            
            # Check that is_new_user is False for existing user
            if otp_data.get("is_new_user") != False:
                self.log_test(
                    "Verify OTP (Existing User)",
                    False,
                    f"Expected is_new_user=False for existing user, got: {otp_data.get('is_new_user')}",
                    otp_data
                )
                return None
            
            # Verify OTP without name (since user exists)
            verify_response = self.session.post(
                f"{self.base_url}/auth/verify-otp",
                json={
                    "type": "email",
                    "identifier": existing_email,
                    "otp": otp
                },
                headers={"Content-Type": "application/json"}
            )
            
            if verify_response.status_code == 200:
                data = verify_response.json()
                
                # Check required fields
                required_fields = ["user_id", "session_token", "is_new_user"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    self.log_test(
                        "Verify OTP (Existing User)",
                        False,
                        f"Missing required fields: {missing_fields}",
                        data
                    )
                    return None
                
                # Check is_new_user is False
                if data.get("is_new_user") != False:
                    self.log_test(
                        "Verify OTP (Existing User)",
                        False,
                        f"Expected is_new_user=False, got: {data.get('is_new_user')}",
                        data
                    )
                    return None
                
                user_id = data.get("user_id")
                self.log_test(
                    "Verify OTP (Existing User)",
                    True,
                    f"Successfully logged in existing user. user_id: {user_id}, session_token: {data.get('session_token')[:20]}...",
                    data
                )
                return user_id
                
            else:
                self.log_test(
                    "Verify OTP (Existing User)",
                    False,
                    f"HTTP {verify_response.status_code}: {verify_response.text}",
                    None
                )
                return None
                
        except Exception as e:
            self.log_test(
                "Verify OTP (Existing User)",
                False,
                f"Exception occurred: {str(e)}",
                None
            )
            return None

    def test_forgot_password(self):
        """Test POST /api/auth/forgot-password"""
        test_email = "test@filmcompanion.com"
        
        try:
            response = self.session.post(
                f"{self.base_url}/auth/forgot-password",
                json={"email": test_email},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Check required fields
                if "success" not in data:
                    self.log_test(
                        "Forgot Password",
                        False,
                        "Missing 'success' field in response",
                        data
                    )
                    return
                
                if data.get("success") != True:
                    self.log_test(
                        "Forgot Password",
                        False,
                        f"Expected success=True, got: {data.get('success')}",
                        data
                    )
                    return
                
                self.log_test(
                    "Forgot Password",
                    True,
                    f"Successfully sent password reset email to {test_email}",
                    data
                )
                
            else:
                self.log_test(
                    "Forgot Password",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    None
                )
                
        except Exception as e:
            self.log_test(
                "Forgot Password",
                False,
                f"Exception occurred: {str(e)}",
                None
            )

    def test_user_id_mapping(self, user_id_1: str, user_id_2: str):
        """Test 1:1 mapping enforcement - same email should return same user_id"""
        if user_id_1 and user_id_2:
            if user_id_1 == user_id_2:
                self.log_test(
                    "1:1 User ID Mapping",
                    True,
                    f"Same email correctly returned same user_id: {user_id_1}",
                    {"user_id_1": user_id_1, "user_id_2": user_id_2}
                )
            else:
                self.log_test(
                    "1:1 User ID Mapping",
                    False,
                    f"Same email returned different user_ids: {user_id_1} vs {user_id_2}",
                    {"user_id_1": user_id_1, "user_id_2": user_id_2}
                )
        else:
            self.log_test(
                "1:1 User ID Mapping",
                False,
                "Could not test mapping - missing user IDs from previous tests",
                {"user_id_1": user_id_1, "user_id_2": user_id_2}
            )

    def run_all_tests(self):
        """Run all OTP authentication tests"""
        print("🎬 Starting Film Companion OTP Authentication Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 80)
        
        # Test 1: Send Email OTP
        email_otp = self.test_send_email_otp()
        
        # Test 2: Send Phone OTP
        phone_otp = self.test_send_phone_otp()
        
        # Test 3: Verify OTP for new user
        new_user_id = self.test_verify_otp_new_user()
        
        # Test 4: Verify OTP for existing user (same email)
        existing_user_id = self.test_verify_otp_existing_user()
        
        # Test 5: Forgot Password
        self.test_forgot_password()
        
        # Test 6: 1:1 mapping enforcement
        self.test_user_id_mapping(new_user_id, existing_user_id)
        
        # Summary
        print("=" * 80)
        print("🎬 TEST SUMMARY")
        print("=" * 80)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        print()
        
        # Show failed tests
        failed_tests = [result for result in self.test_results if not result["success"]]
        if failed_tests:
            print("❌ FAILED TESTS:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['details']}")
        else:
            print("✅ ALL TESTS PASSED!")
        
        print()
        print("📧 Check backend logs for:")
        print("   - Mock welcome email sent from noreply@filmcompanion.com")
        print("   - Mock OTP SMS/email logs")
        
        return passed == total

def main():
    """Main test runner"""
    tester = OTPAuthTester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()