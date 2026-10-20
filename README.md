# Shop Schedule Sync v3

Automatically import your assigned work shifts from [CP Shop Tech Scheduler](https://scheduler2-0.vercel.app/) into Google Calendar and email you when a schedule changes. The GitHub Actions workflow signs in with your username/password **on every run**, so no computer needs to stay on and no session cookie needs to remain valid.

## Status

**Built and tested against the visible content of the provided October 19 screenshot, but not yet tested against the logged-in live website. The integration has NOT been activated.**

The "My Shifts" tab includes an "Upcoming Shifts" list. Each assigned shift shows a work location and a date/time range, for example:

- Mustang ’60, Monday October 19, 2026, 4:00–6:00 PM
- Hangar, Tuesday October 20, 2026, 4:00–6:00 PM
- Mustang ’60, Wednesday October 21, 2026, 4:00–6:00 PM

All dates are interpreted in `America/Los_Angeles` time, including daylight saving changes. The extractor uses visible text rather than CSS classes, and only imports items marked **Assigned**. These three examples pass automated tests. The screenshot shows only part of a page, so the actual site may have additional shifts or a different DOM reading order. A live dry run must verify every extracted shift before activation.

The calendar synchronization creates/updates existing events and prevents duplicate entries when repeated. Revisions to a time on the same day and at the same location update the event. **Cancellations, changes of day/location, and newly inserted multiple same-location shifts are not guaranteed to reconcile correctly yet**, since the screenshot doesn't expose an immutable schedule-entry ID. The integration intentionally does not delete missing shifts because the site may show only upcoming shifts, not complete history. Always verify canceled or rescheduled shifts on the original site.

## Step 1: Prepare a computer (one time)

You need a laptop/desktop with Node.js 22+ and a private GitHub repository. From the unzipped project directory:

```sh
npm install
npx playwright install chromium
```

Create a local `.env` file from `.env.example`. On macOS or Linux:

```sh
cp .env.example .env
```

Then open **only** `.env` in your editor, and set:

```dotenv
SCHEDULER_EMAIL=your-shop-scheduler-email
SCHEDULER_PASSWORD=your-new-password
```

Use a **new** password if your earlier password was shared in chat. Never place the password in source files, commits, screenshots, or messages. The `.gitignore` excludes `.env`.

The `config.json` login works with ordinary email/password forms and waits for `Sign out` to appear as an authentication indicator. Because we have only a screenshot of an already logged-in page, the login field selectors are generic and **need real-world testing**. If login fails, use the optional selectors in `config.json` and do not enable unattended operation.

## Step 2: Test scheduler extraction without touching Google

```sh
npm run check -- --dry-run
```

It should print an array of shifts with IDs, locations, titles, start times, and end times. Check each against the `My Shifts > Upcoming Shifts` page. It is **essential** to verify all visible shifts are included, not merely the first three in the screenshot. If no shifts or a changed page layout is encountered, the program stops instead of sending a blank calendar update.

For troubleshooting, `npm run inspect` writes `.local/scheduler.png`, `.local/scheduler.html`, and `.local/scheduler-text.txt` on your machine after login. These files are private. **Do not upload the complete HTML**, because it may contain names, session data, or other sensitive information. Share only a tiny redacted HTML fragment if needed.

To test the parser against the screenshot examples, run `npm test`.

## Step 3: Configure Google Calendar and notification emails

The Google Calendar and Gmail connections in ChatGPT do **not** automatically authorize a standalone GitHub program. This project uses a small Google Apps Script web app that runs **as your Google account** and is authenticated by a long shared secret.

1. Visit https://script.google.com/ in the Google account whose calendar and Gmail you want to use. Create a new project and replace `Code.gs` with `google-apps-script/Code.gs`.
2. In **Project Settings > Script Properties**, add:
   - `EMAIL_TO`: your notification email address.
   - `TIMEZONE`: `America/Los_Angeles`.
   - `SHARED_SECRET`: a random 32+ character secret different from your scheduler password. To generate a secret on your computer: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `CALENDAR_ID` (optional): a dedicated `Work Shifts` calendar ID. If omitted, imports go into your primary Google Calendar.
3. Run the `authorizeGoogleAccess` function once from the Apps Script editor to authorize calendar/email permissions.
4. Choose **Deploy > New deployment > Web app**. Use **Execute as: Me**. Choose **Who has access: Anyone** if your Google account and organization allow it. Note that this publishes an internet-accessible receiver; a strong unique `SHARED_SECRET` is used to authenticate requests. Do not use this arrangement if your workplace policies prohibit it. If anonymous web app deployment is unavailable, an alternative Google Cloud OAuth/service-account design will be required.
5. Copy the deployment URL ending `/exec` and enter it in your **local** `.env` as `GOOGLE_SCRIPT_WEBAPP_URL`. Enter the same secret under `GOOGLE_SCRIPT_SHARED_SECRET`.
6. Once the dry run has correctly identified *all* of your shifts, run `npm run check` without `--dry-run` to add/update calendar events and send the first shift summary.
7. Run `npm run check` **again** to confirm it reports zero new or updated shifts and sends no duplicate email.

Remember that edits to an already deployed Apps Script require publishing a **new version** in the deployment manager before those edits become live.

## Step 4: Enable hands-off hourly checks in GitHub

1. Create a **private GitHub repo** and upload these project files. Never upload `.env`, `.local`, or any copied authentication state.
2. Go to **Settings > Secrets and variables > Actions** and add four **repository secrets**:

   | Name | Value |
   | --- | --- |
   | `SCHEDULER_EMAIL` | Your scheduler login email |
   | `SCHEDULER_PASSWORD` | Your rotated scheduler login password |
   | `GOOGLE_SCRIPT_WEBAPP_URL` | The Apps Script deployment `/exec` URL |
   | `GOOGLE_SCRIPT_SHARED_SECRET` | The random secret matching Script Properties |

3. Under GitHub **Actions > Check shop schedule > Run workflow**, leave **dry_run = true** and run a manual test. Open the workflow logs and confirm dates and locations. The test does not email you or change the calendar.
4. Run it again with **dry_run = false** and verify the Google Calendar result.
5. Under **Settings > Secrets and variables > Actions > Variables**, create a *repository variable* named `SCHEDULE_SYNC_ENABLED` set to `true`. This activates hourly scheduled runs. Keep it absent or `false` until everything is verified.

The workflow is scheduled around minute 17 of every hour (UTC). GitHub may delay scheduled jobs. It runs without your computer being on. If the site adds CAPTCHA, 2FA, or blocks browser automation, the workflow may stop functioning and should not bypass those security measures.

## Design notes

- Login: `src/auth.mjs`. Uses generic email/password form detection and an optional `text=Sign out` success check; cannot guarantee compatibility without testing the live page.
- Website extraction: `src/extract.mjs`. Selects **My Shifts** and reads **Upcoming Shifts** cards. Recognizes **Assigned**, **Request Pickup**, the arrow date/time range, and the location line with the pin icon. Stops on an unexpected date format instead of guessing.
- Time parsing: `src/parse.mjs` uses the named California time zone, validates weekdays, and infers years when the website omits them.
- Sync: `google-apps-script/Code.gs` records per-shift event IDs in Script Properties, creates events, updates their time/title/location, and only emails when something changes. Email includes all currently visible shifts with their locations. Missing shifts are **not** deleted automatically.
- Security: all credentials are stored in your local `.env` and later in private GitHub repository secrets. No real credentials are distributed in the zip. Store the Google shared secret only in script settings and protected variables.

### Troubleshooting

- `Could not find email/password login form`: the login form's selectors differ; inspect the login page locally and update `config.json > login` selectors.
- `text=Sign out` not visible: login may have failed or the page text differs from the screenshot. Confirm signed-in state before enabling sync.
- `Could not find Upcoming Shifts`: ensure the **My Shifts** tab is selected and a current schedule is published.
- `Found an assigned shift without a recognized date range`: the site changed its date formatting, or cards need different boundaries. Leave the sync disabled and share a sanitized snippet.
- `No assigned upcoming shifts`: no items may be published, or the site has changed. This intentionally stops the sync rather than wiping calendars.
- `Apps Script returned non-JSON`: verify the deployment URL and web app permissions.
- `Unauthorized`: check the script-side and GitHub-side shared secrets match exactly.

The project has not yet been tested by signing in to the real scheduling website, so the next milestone is your successful dry-run log, not activating automatic imports immediately.
