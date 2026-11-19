# PHONE SETUP GUIDE (sirf Android phone se, Hinglish)

Total time ~60-75 min. Chrome browser use karo. Kahin bhi **card / payment** maange to ruk jao aur mujhe batao.
Page ke button ke naam kabhi-kabhi thode alag ho sakte hain; jo sabse close ho wo dabao.

## Step 1: Code ko main branch me lao (2 min)
1. github.com -> apna repo **Faltu** kholo.
2. **Pull requests** tab -> **New pull request**. base: `main`, compare: `ccr-61587a00-jmkyt4`.
3. **Create pull request** -> **Merge pull request** -> **Confirm merge**.
(Ya Claude ko bolo: "PR bana do aur merge ka link do".)

## Step 2: Supabase database (10 min)
1. supabase.com -> Sign in with GitHub -> **New project**. Name `gta6`, **Database Password**: ek lamba password banao aur notes me save karo. Region: **Mumbai (ap-south-1)**. Plan: **Free**. -> **Create new project**.
2. Left menu -> **SQL Editor** -> **New query**. GitHub me `gta6-engine/migrations/001_init.sql` kholo -> **Raw** -> sab copy -> Supabase me paste -> **Run**. Phir new query me `002_settings_uploaded_at.sql` ka content paste -> **Run**. "Success" aana chahiye.
3. Upar **Connect** button -> **Transaction pooler** (port 6543) wala URL copy karo. Usme `[YOUR-PASSWORD]` ki jagah apna password daalo. URL ke shuru me `postgresql://` ko `postgresql+psycopg2://` kar do. Ye hai **DATABASE_URL**.

## Step 3: Cloudflare R2 (10 min)
1. dash.cloudflare.com -> sign up (free) -> left **R2 Object Storage** -> **Create bucket** -> name `gta6-media` -> Create. (R2 free plan ke liye card maang sakta hai; agar maange to ruk jao.)
2. R2 page -> **Manage R2 API Tokens** -> **Create API token** -> Permission **Object Read & Write** -> bucket `gta6-media` select -> Create. Ye 3 cheezein copy karo: **Access Key ID** (=S3_ACCESS_KEY), **Secret Access Key** (=S3_SECRET_KEY), aur **endpoint URL** `https://<account_id>.r2.cloudflarestorage.com` (=S3_ENDPOINT). S3_BUCKET = `gta6-media`.

## Step 4: GitHub Secrets (10 min)
GitHub -> Faltu -> **Settings** -> **Secrets and variables** -> **Actions**.
- **New repository secret** se ye banao (name exact, value paste): `DATABASE_URL`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.
- **Variables** tab -> **New repository variable**: `TTS_PROVIDER` = `edge`, `DAILY_BUDGET_USD` = `0`, `NEWS_RSS_FEEDS` = `https://www.gamespot.com/feeds/news/,https://feeds.feedburner.com/ign/news`.
- **Actions** tab -> **gta6-tests** green hona chahiye (agar red ho to screenshot bhejo).
- **Actions** -> **gta6-worker** -> **Run workflow** -> task `research` -> Run. Phir dubara task `work`. Log me daily report JSON dikhna chahiye.

## Step 5: Dashboard on Render (10 min)
1. render.com -> Sign in with GitHub -> **New +** -> **Blueprint** -> repo **Faltu** select -> Connect. (`render.yaml` apne aap mil jayega.)
2. Env vars bharo: `DATABASE_URL`, `DASHBOARD_TOKEN` (kam se kam 12 akshar ka lamba password; ye aapka login hai), `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. Baaki (`PUBLIC_URL`, `GH_*`, `YT_*`) abhi khali chhod do.
3. Plan **Free** hi rakho. **Apply / Deploy**. Build 5-10 min lega.
4. Deploy ke baad upar URL dikhega (jaise `https://gta6-command-center.onrender.com`). Render -> service -> **Environment** me `PUBLIC_URL` = wahi URL daalo -> Save.
5. URL kholo -> `DASHBOARD_TOKEN` daalo -> Sign in. Chrome menu (3 dots) -> **Add to Home screen**.
6. `/health` check: `<URL>/health` kholo -> `{"ok":true,"locked":false}` aana chahiye.

## Step 6: "Run worker now" button (5 min, optional but useful)
1. GitHub -> profile photo -> **Settings** -> **Developer settings** -> **Personal access tokens** -> **Fine-grained tokens** -> **Generate new token**. Repository access: **Only select repositories** -> Faltu. Permissions -> Repository -> **Actions: Read and write**. Generate, token copy karo.
2. Render -> Environment: `GH_DISPATCH_TOKEN` = token, `GH_REPO` = `ffrastogi737-art/Faltu`. Save.

## Step 7: YouTube connect (20 min). Pehle 1-2 hafte sirf Approve/Reject karke quality dekho
1. console.cloud.google.com -> New Project -> **APIs & Services** -> **Library** -> **YouTube Data API v3** -> Enable. Phir **YouTube Analytics API** -> Enable.
2. **OAuth consent screen** -> External -> app name `gta6 engine` -> apna email -> **Test users** me apna YouTube wala email add karo. Baad me **Publish app** (In production) dabao, warna token 7 din me expire hota hai (aur "unverified app" warning aaye to Advanced -> Continue).
3. **Credentials** -> **Create credentials** -> **OAuth client ID** -> **Web application** -> **Authorized redirect URIs** me ye daalo: `<Render URL>/oauth/youtube/callback` -> Create. **Client ID** aur **Client secret** copy karo.
4. Render Environment me `YT_CLIENT_ID`, `YT_CLIENT_SECRET`; GitHub Secrets me bhi wahi dono.
5. Dashboard -> **CONTROLS** -> **Connect YouTube (OAuth)** -> Google me channel select karke Allow -> "YouTube connected" dikhega. Phir **Test connection** dabao; channel ka naam aana chahiye.
6. **Zaroori:** naye Google API project se upload **private** hi rehte hain jab tak Google audit approve na kare ("YouTube API Services - Audit and Quota Extension Form" bharna padta hai). Tab tak video ko YouTube Studio me khud Public karo.

## Step 8: Apna gameplay footage (optional, quality ke liye)
R2 bucket me folder `library/` banao aur apni khud ki GTA recordings daalo. Dusre ki videos/trailers mat daalo (copyright). Clipping ke liye stream file `sources/` me daalo, phir CLIPS tab -> Source video.

## Rozana kaam
Dashboard -> HOME -> Pending approvals -> Preview -> Approve/Reject -> VIDEOS -> Publish.

## Band / chalu karna
CONTROLS -> All engines -> **Pause** (rukna), **Resume**, **Stop** (queue cancel), **Start**.
