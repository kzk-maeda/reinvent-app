import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) { console.log('.env は既にあります。変更しません。'); }
else { writeFileSync('.env', `APP_PASSWORD=${randomBytes(18).toString('base64url')}\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nAI_PROVIDER=simulator\nHOST=127.0.0.1\n`, { mode: 0o600 }); console.log('.env を生成しました。APP_PASSWORDを使ってログインしてください。'); }
