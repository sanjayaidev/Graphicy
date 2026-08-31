# ClientPM — solo client ledger

A lightweight client management app for one user. Google Sheets is the
database (via an Apps Script Web App); this Express app is the UI + a
thin API proxy in front of it, deployable to Vercel.

## How it fits together

```
Browser  <-->  Express (this app, on Vercel)  <-->  Apps Script Web App  <-->  Google Sheet
```

The Sheet is the single source of truth. You can edit rows by hand in
Google Sheets and the app will reflect it on next load; edits made in the
app write straight back to the same Sheet.

## 1. Set up the Sheet + Apps Script

Use the `Code.gs` file provided separately. In short:
1. script.google.com -> new project -> paste `Code.gs` in
2. Run `setupSheet` once, approve permissions
3. Run `setApiSecret('something-long-and-random')`
4. Deploy -> New deployment -> Web app -> Execute as Me, Access: Anyone
5. Copy the `/exec` URL

## 2. Configure this app

```
cp .env.example .env
```

Fill in:
- `APPS_SCRIPT_URL` — the `/exec` URL from step above
- `APPS_SCRIPT_SECRET` — same string you passed to `setApiSecret`
- `APP_PASSWORD` — the password you'll type to log into the app
- `SESSION_SECRET` — any long random string (used to sign the login cookie)

## 3. Run locally

```
npm install
npm start
```

Visit http://localhost:3000 — you'll land on the login screen first.

## 4. Deploy to Vercel

```
npm i -g vercel   # if you don't have it
vercel
```

Then add the same four env vars in the Vercel project's Settings ->
Environment Variables (Production + Preview), and redeploy.

## Notes

- No database beyond the Sheet — no Postgres, no Redis, nothing else to host.
- Single-user auth only: one shared password, no accounts/roles.
- Every write (add/edit/delete client, task, payment) is logged to the
  `History` tab automatically by the Apps Script backend.
- `PaymentStatus` on a client row updates automatically whenever you log
  a payment against them.
