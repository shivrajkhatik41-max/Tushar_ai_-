# Telegram AI Bot v2

Features: chat (yaad rakhta hai), /history (purani chats kholo/delete), /notes (PDF notes), /yt (YouTube se PDF notes), /pdf, /image, photo samajhna.

## Setup (computer par test)
1. @BotFather > /newbot > token lo. Google AI Studio (https://aistudio.google.com/apikey) se Gemini API key lo.
2. `.env.example` ko `.env` naam se copy karke keys bharo.
3. `node --env-file=.env bot.js`

## LIVE karna (24x7)
Bot "long polling" se chalta hai, isliye use ek aisi jagah chahiye jo band na ho.

### Option A: VPS (sabse stable, lagbhag $4-6/month)
    # Ubuntu server par
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt install -y nodejs
    # is folder ko server par copy karo, phir:
    npm i -g pm2
    pm2 start "node --env-file=.env bot.js" --name tgbot
    pm2 save && pm2 startup
History data/data.json mein save hoti hai, backup le lena.

### Option B: Railway / Fly.io (Dockerfile ready hai)
1. Folder GitHub par daalo (.env mat daalna). Railway par "Deploy from GitHub".
2. Variables mein TELEGRAM_TOKEN, GEMINI_API_KEY (aur zaroorat ho to baaki) set karo.
3. **Volume** banao, mount path `/data`, aur variable `DATA_DIR=/data` set karo. Bina volume ke har redeploy par history mit jayegi.

Free hosting (jo so jaati hai ya files mita deti hai) is bot ke liye theek nahi.

## Dhyan rakho
- Notes ka PDF Roman script (English/Hinglish) mein banta hai. Devanagari font bundle nahi hai, isliye Hindi script PDF mein "?" dikhegi.
- /yt unofficial tarike se transcript leta hai. Cloud server par YouTube kabhi block kar deta hai, tab bot bolega aur aap transcript paste karke /notes use kar sakte hain. Sirf captions wale videos par chalega.
- Bahut lambe video ka transcript kaat diya jata hai (pehle ~60,000 characters).
- Keys kisi ke saath share na karein. DAILY_LIMIT aur ALLOWED_USERS se kharcha control karein.
