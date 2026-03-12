# Auth Testing Playbook for Film Companion

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: '',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API
```bash
curl -X POST "https://showtime-setup.preview.emergentagent.com/api/auth/mock-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@mock.com","name":"Test User"}'
```

## Step 3: Browser Testing
```javascript
// Test mock login flow
await page.goto("https://showtime-setup.preview.emergentagent.com");
await page.click('[data-testid="email-auth-btn"]');
// Fill mock login form
await page.fill('[data-testid="mock-name-input"]', 'Test User');
await page.click('[data-testid="mock-login-submit"]');
// Should navigate to onboarding
```

## Checklist
- [ ] Mock login creates user and returns session token
- [ ] Auth screen renders with all 4 buttons
- [ ] Mock login modal opens and closes
- [ ] After mock login, navigates to onboarding
- [ ] Onboarding steps 1-12 navigate correctly
- [ ] TMDB search returns movie results
- [ ] Profile data saves to AsyncStorage
- [ ] Success screen shows with curtain animation
