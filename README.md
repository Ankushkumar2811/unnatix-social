# UnnatiX Social — Phase 1

Ek hi dashboard se UnnatiX ke Facebook, Instagram, LinkedIn, X, YouTube, aur Google My Business accounts connect, post, aur schedule karne ke liye. Pinterest Phase 2 mein add hoga.

## Folder structure
```
unnatix-social/
  backend/     -> Node + Express API, OAuth, scheduler (cron)
  frontend/    -> React dashboard (Vite)
```

## Step 1 — Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

`.env` mein ye credentials bharo:

### Meta (Facebook + Instagram)
1. https://developers.facebook.com/apps par jaake "Create App" → type: **Business**
2. App ke andar "Facebook Login" product add karo
3. Settings → Basic se `App ID` aur `App Secret` copy karke `.env` mein daalo
4. Facebook Login → Settings mein **Valid OAuth Redirect URI** add karo:
   `http://localhost:4000/auth/meta/callback`
5. Instagram ke liye: tumhara Instagram account **Business/Creator** hona chahiye aur Facebook Page se linked hona chahiye

⚠️ Important: Jab tak app "Live" mode mein nahi hai (Meta App Review pass nahi hua), sirf tumhare apne Facebook account (jo Developer role mein add ho) se login chalega — clients ke accounts nahi. UnnatiX ke khud ke accounts ke liye ye theek hai.

### LinkedIn
1. https://www.linkedin.com/developers/apps par "Create App"
2. Products tab mein "Share on LinkedIn" aur "Sign In with LinkedIn using OpenID Connect" add karo
3. Auth tab se Client ID/Secret copy karo
4. Redirect URL add karo: `http://localhost:4000/auth/linkedin/callback`

### X (Twitter)
1. https://developer.x.com par project/app banao
2. App settings mein OAuth 2.0 enable karo
3. App type: confidential client / web app rakho
4. Callback / Redirect URL add karo: `http://localhost:4000/auth/x/callback`
5. Website URL mein frontend URL daalo: `http://localhost:5173`
6. Client ID/Secret copy karke `.env` mein daalo
7. Scopes ki zaroorat hogi: `tweet.read`, `tweet.write`, `users.read`, `offline.access`

Note: X API posting ke liye paid/approved developer access ki zaroorat pad sakti hai. Free/basic access mein endpoint permissions aur limits account plan ke hisaab se fail ho sakte hain.

### Google (YouTube + Google My Business)
1. https://console.cloud.google.com par naya project banao
2. APIs & Services → Library mein ye enable karo:
   - **YouTube Data API v3**
   - **My Business Account Management API**
   - **My Business Business Information API**
3. APIs & Services → OAuth consent screen set karo (External, testing mode mein UnnatiX ka Google account add karo as test user)
4. Credentials → Create Credentials → OAuth Client ID → type: Web Application
5. Authorized redirect URI: `http://localhost:4000/auth/google/callback`
6. Client ID/Secret copy karke `.env` mein daalo

⚠️ Important: **Google My Business ka Local Posts API access by-default nahi milta** — Google se manually request karni padti hai (Business Profile API access request form bharke). Jab tak approval nahi milta, YouTube connect ho jayega lekin GMB posts fail honge. Is form ko jaldi submit kar dena kyunki approval mein time lagta hai.

Phir backend start karo:
```bash
npm start
```

## Step 2 — Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Browser mein kholo: http://localhost:5173

## Kaise use karein
1. **Accounts** tab → "Connect Facebook/Instagram", "Connect LinkedIn", "Connect X", ya "Connect Google" par click karo, login karo
2. **Naya Post** tab → account select karo, caption likho, image URL do (Instagram ke liye zaroori), date-time set karo, "Schedule Post" dabao
3. **Schedule** tab → sab upcoming aur published posts dikhenge. Backend har 1 minute mein check karta hai aur due posts automatically publish kar deta hai

## Important notes
- Ye Phase 1 hai — sirf posting + scheduling. Analytics dashboard Phase 2 mein banega
- Backend ko hamesha chalu rakhna padega taaki scheduled posts time pe publish hon (production mein ise kisi server jaise Render/Railway pe deploy karna hoga, sirf laptop pe nahi)
- Tokens `backend/data/db.json` mein store hote hain — ye file kabhi GitHub pe push mat karna
- Instagram par sirf image/video posts chalte hain, text-only nahi
