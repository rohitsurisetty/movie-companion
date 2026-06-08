# Test Credentials

## Email Auth (Mock OTP)
- Email: testuser@example.com
- OTP: Backend returns OTP in response (for testing mode)
- Name: Test User (for new users)

## Auth Flow
1. Call POST /api/auth/send-email-otp with email
2. Backend returns { success: true, otp: "XXXXXX", is_new_user: true/false }
3. Call POST /api/auth/verify-otp with email, otp, and name (if new user)
4. Backend returns session token and user data

## Notes
- OTP is shown in alert dialog for testing
- Mock auth - any valid OTP format works as long as it matches what was stored during send-otp
