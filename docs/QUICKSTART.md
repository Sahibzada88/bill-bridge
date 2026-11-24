# QUICKSTART — Local aur Live setup (Roman Urdu + English)

Aap ko sirf **3 cheezein** chahiye: Supabase ka free account, Node.js (v22.12+), aur (optional) Gmail.
Koi Docker, koi alag Storage bucket, koi AWS/Redis nahi. Files (bills/receipts) **base64 ke tor par Supabase database mein hi** save hoti hain.
*(You need only a free Supabase account, Node.js 22.12+, and optionally Gmail. No Docker, no storage bucket. Files are kept as base64 inside the Supabase database.)*

---

## A. Local setup (10 minute)

**1. Supabase project banayein** — supabase.com → New project (free). Region apne qareeb wala.

**2. Database ek baar banayein** — Supabase → *SQL Editor* → *New query* → file `supabase/setup_all.sql` poori copy-paste → **Run**.
Yeh sirf **ek baar** chalani hai (dobara chalane se "already exists" error aayega; naya project banayein).

**3. Login links allow karein** — Supabase → *Authentication → URL Configuration*:
- Site URL: `http://localhost:3000`
- Redirect URLs mein add: `http://localhost:3000/auth/callback`

**4. Terminal mein:**
```bash
npm install
npm run setup      # 3 Supabase keys (Project Settings → API) paste karein; Gmail optional
npm run dev        # http://localhost:3000
```
`npm run setup` aap ke liye `.env.local` bana deta hai aur khud check bhi karta hai.

**5. Check kabhi bhi chalayein:** `npm run doctor` — batata hai kya theek hai, kya fix karna hai (database, Gmail, admin).

**6. Pehla admin** — site par register karein → email verify karein → phir:
```bash
npm run make-admin -- aapki@email.com
```
Login karein → authenticator app (Google Authenticator/Authy) ka QR scan karein (admin ke liye lazmi).

Demo data (optional, sirf testing): `npm run seed` (sab kuch `[DEMO]` likha hota hai).

---

## B. Gmail — Google App Password

Gmail ka **normal password kaam nahi karta**. App Password banana hai:
1. Google Account → *Security* → **2-Step Verification ON** karein.
2. https://myaccount.google.com/apppasswords → naam: `BillBridge` → **Create** → 16 haroof ka code milega (`abcd efgh ijkl mnop`; spaces ho to bhi theek).
3. `npm run setup` mein Gmail address + yeh code dein (ya `.env.local` mein `GMAIL_USER`, `GMAIL_APP_PASSWORD`).
4. Test: `npm run doctor -- --send-test aapki@email.com`

Is se app yeh emails bhejti hai: notifications (naya message, payment submit/confirm/dispute, sawal-jawab, reservation), aur contact form ka message aap ke inbox mein. User Settings mein email notifications band kar sakta hai.

### Signup / password-reset emails (Supabase ke apne emails) bhi Gmail se bhejein
Supabase → *Authentication → Emails → SMTP Settings* → **Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | aapka Gmail |
| Sender name | BillBridge |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | aapka Gmail |
| Password | wahi 16-letter App Password |

Phir *Authentication → Emails → Templates* mein links aise rakhein (kisi bhi device par kaam karte hain):
- Confirm signup: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/dashboard`
- Reset password: `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

**Limits:** personal Gmail ≈ 500 emails/din. Supabase custom SMTP par default ~30 emails/ghanta hai (*Authentication → Rate Limits* mein barha sakte hain). Bohat bara platform ho to baad mein Resend/Brevo jaisa service use karein.

---

## C. Live setup (Vercel)

1. **Pehle** Supabase ka SQL (A-2) us project par chala len jo live use hoga (behtar: local ke liye alag, live ke liye alag project).
2. Vercel par deploy (manual — koi GitHub automation nahi):
   ```bash
   npx vercel          # project link
   ```
   Vercel *Settings → Environment Variables* mein wohi values daalein jo `.env.local` mein hain:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
   aur **`NEXT_PUBLIC_SITE_URL` = aapka live URL** (https://...). ⚠️ `NEXT_PUBLIC_*` values **build ke waqt** fix ho jati hain — deploy se **pehle** set karein.
   ```bash
   npx vercel --prod
   ```
3. Supabase → *Authentication → URL Configuration*: Site URL = live URL; Redirect URLs mein `https://aapka-url/auth/callback` add karein.
4. `npm run doctor` chalayein (live project ki keys ke saath) → sab ✔ hona chahiye.
5. Pehla admin: A-6 jaisa.
6. **Recommended:** Cloudflare Turnstile (free CAPTCHA): `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` daal dein. Bina CAPTCHA ke bhi login/register rate-limited hain, lekin bots try kar sakte hain.

---

## D. Files database mein: faide aur hadood

| | |
|---|---|
| ✅ | Koi Storage bucket/policy/extra credentials nahi. Backup = database backup |
| ✅ | Files phir bhi **private** hain: table sirf server (service key) padh sakta hai; browser ko sirf authorize + log hone ke baad file milti hai |
| ⚠️ | Supabase free database ≈ 500 MB. Ek bill ≈ 0.3–1.5 MB (base64 se 33% zyada). Sainkron bills theek; hazaron ke liye `STORAGE_BACKEND=storage` kar dein (purani files phir bhi khulti rahengi) |
| ⚠️ | Vercel request limit ≈ 4.5 MB: bari photos browser khud chhoti kar deta hai; PDF pehle se chhoti honi chahiye |

---

## E. Masle aur hal

| Masla | Hal |
|---|---|
| `doctor`: "Database tables not found" | SQL (A-2) chalana reh gaya |
| `doctor`: "Gmail rejected the login" | Normal password nahi, **App Password** dein; 2-Step Verification ON ho |
| Signup email nahi aa raha | Supabase SMTP (B) set karein; spam folder dekhein; rate limit |
| Email link kholne par login fail | Redirect URL list mein `/auth/callback` add karein; templates (B) |
| Admin login par authenticator maangta hai | Yeh zaroori hai (MFA). QR scan karein |
| Live par "NEXT_PUBLIC… undefined" jaisa masla | Vercel env vars set karke **dobara deploy** karein (build-time) |
| Upload "too large" | 4.5 MB se choti file; photos auto-shrink hoti hain, PDF nahi |
