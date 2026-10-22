# CnJ Studio Official Portal

A Node.js website for the CnJ Studio Roblox community (group ID `15668427`). It includes public username/group-role lookup, development project cards, a public list of explicitly approved blacklist entries, and an admin console protected by Roblox OAuth plus a server-side numeric user ID allowlist.

## Features
- Roblox username search with group membership and role lookup
- Roblox OAuth login (server-side secret only)
- Admin-only blacklist create/delete; public page shows only entries explicitly marked public
- Admin-only project create/delete; initial project cards are editable/deletable
- JSON data file at `data/site-data.json`; session files stored under `data/sessions/`
- Responsive, original CSS-based CnJ Studio design; no third-party game art is bundled

## Run locally
1. Install Node.js 20+ from https://nodejs.org/ .
2. Extract this project and open a terminal in this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Set `ROBLOX_CLIENT_ID`, `ROBLOX_CLIENT_SECRET`, and `ADMIN_ROBLOX_USER_ID` in `.env`. The admin ID is your personal numeric Roblox user ID, not group ID `15668427`.
6. Register `http://localhost:3000/auth/callback` as an OAuth redirect URL and enable `openid` and `profile` scopes.
7. Use a long random `SESSION_SECRET`.
8. Run `npm start` and open `http://localhost:3000`.

## Publish online
This ZIP is a project package, not a live website. To publish it, deploy the Node.js app to a host that supports persistent disk/storage (for example, a Node web service with a persistent disk). Configure the environment variables below in the host dashboard and set `BASE_URL` to the final HTTPS URL. Add `https://YOUR-DOMAIN/auth/callback` to the Roblox OAuth app redirect URLs. Set `NODE_ENV=production` and `SESSION_SECRET` to a strong random secret.

**Persistent storage is required.** The app writes blacklist/project records and file-based sessions under the `data/` directory. If your hosting provider has an ephemeral filesystem, records and sessions can disappear on restart/redeploy. Attach persistent storage to the app's `data` directory, or replace the JSON/file store with a managed database/session store before public launch. Do not deploy as a static-only site.

## Admin usage
1. Log in with the Roblox account whose numeric ID is configured as `ADMIN_ROBLOX_USER_ID`.
2. Select “관리자 권한 확인” / “관리자 콘솔 열기”.
3. Use the forms to add blacklist records and development projects.
4. Only tick the public checkbox when the entry is suitable for public display. Public entries show username, reason and date; the numeric user ID remains in the admin console.

## Privacy, moderation and copyright
- Use only accurate, verifiable, proportionate reasons. Avoid publishing personal information, private conversations, speculation, insults or sensitive details. Provide a way to contact the studio to request a correction/removal before using a public blacklist at scale.
- A listing is an internal community record, not an official Roblox ban or finding.
- Use only assets you created, have permission to use, or are licensed to use. The included design uses CSS-generated visuals and text; do not upload third-party game thumbnails, logos, music or artwork without permission.
- This project does not guarantee legal compliance. Review applicable laws and Roblox terms before public launch.
- The site only reads public group information; it does not change Roblox group ranks or enforce bans inside Roblox experiences.
