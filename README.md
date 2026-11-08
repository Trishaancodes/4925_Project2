# ListForge

COMP 4921 Project 2: a multi-user, schema-driven list manager. Users design **list templates**
(columns, types and rules), create **lists** from any template, and add **entries** that are
validated on the server against the template's rules before they are saved.

## Features

- **Accounts:** sign up, log in and log out with bcrypt-hashed passwords. Passwords need 10+ characters
  with an uppercase letter, a lowercase letter, a number and a symbol.
- **Sessions:** stored in MongoDB and encrypted (AES-GCM) with `MONGO_CRYPTO_SECRET`.
- **Viewing vs editing:** anyone can view templates and lists. You must log in to create anything,
  and only the owner can change their templates, lists and entries. Anyone else gets a **400**.
- **Templates** with these column types:

  | Type | Rules |
  |---|---|
  | Checkbox | yes/no |
  | Text (one line) | up to 255 characters |
  | Text box (multi-line) | up to 5000 characters, line breaks kept |
  | Dropdown | value must be one of the template's options |
  | Date | must be a real calendar date |
  | Number | optional minimum and maximum |
  | Email address | must be a valid email |
  | Web link (URL) | must start with `http://` or `https://` |

  Every column can be required or optional.
- **Validation engine** (`lib/validate.js`): every entry is checked on the server against its template.
  The forms also use matching HTML input types, so the browser catches most mistakes first.
- **Safe template editing with versions:** editing a template that already has entries saves a new version.
  Old entries keep the rules they were saved under, and lists keep working.
- **Applying new rules to existing entries:** after a template changes, the list owner can move old entries
  to the newest version. Default values fill empty new columns, and entries that still fail stay on
  their old version until they're fixed one at a time.
- **Starter templates** (Contact, Survey Response, To-Do, Reading List, Event RSVP) that anyone can use.
- **Copy any template** into your own account and change it.
- **Dashboard** with your counts, recent lists and recent entries. An **Entries** page lists every entry in your lists, with search and a list filter. **Settings** shows your account and lets you change your password.
- **Search, filters and pagination** on templates, lists and entries. A popup confirms each new entry, and invalid fields are highlighted with their own message.
- **Bootstrap 5 dark interface** with Bootstrap Icons, a sidebar that highlights the current page (it becomes a slide-out menu on phones), a shared footer, and a sign-in/log-out button. The only custom CSS is a small theme file (`public/css/theme.css`) that sets the orange colours and the sidebar.

## Tech stack

Node.js, Express 5, EJS views, MySQL (`mysql2`), MongoDB (sessions via `connect-mongo`), Bootstrap 5 and Bootstrap Icons.

## Running it locally

```bash
npm install
cp .env.example .env      # then fill in the values (see below)
npm run db:setup          # creates or upgrades the tables (safe to run again)
npm run db:seed           # adds the starter templates (safe to run again)
npm run dev               # http://localhost:3000
npm test                  # unit tests
```

### Environment variables

| Variable | What it is |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `DB_SSL` | `true` for cloud MySQL such as Aiven |
| `DB_SSL_CA` | optional path to the database's CA certificate, which verifies the server's identity |
| `MONGO_URL` | MongoDB connection string for sessions |
| `SESSION_SECRET` | signs the session cookie |
| `MONGO_CRYPTO_SECRET` | encrypts session data stored in MongoDB |
| `TZ_DISPLAY` | optional time zone for showing dates (default `America/Vancouver`) |

With `NODE_ENV=production`, the app refuses to start if any secret is missing.

## Database design

The ERD is in `docs/erd.drawio` (open it at [app.diagrams.net](https://app.diagrams.net)).

| Table | Purpose |
|---|---|
| `user` | accounts (`username` and `email` are unique) |
| `template` | a template's name and owner (unique per owner) |
| `template_version` | v1, v2, … of a template; a new one is made when columns change after entries exist |
| `template_field` | one row per column of a version: name, type, required, `rules` (JSON), order |
| `list` | a list's name, optional description and owner, and which template it follows (always that template's newest version) |
| `list_entry` | one row per entry: `data` (JSON) plus the `version_id` it was validated against |

Foreign keys enforce the relationships. A template can't be deleted while a list uses it, and
a version can't be deleted while entries depend on it.

### SQL antipatterns we avoided

1. **Jaywalking** (comma-separated lists in one column): each column of a template is its own row in
   `template_field`. Dropdown options live in the `rules` JSON, not in a comma-separated string.
2. **Metadata Tribbles** (a new table or column per user list): every list shares the single `list_entry`
   table. The varying columns live in a JSON `data` column that the validation engine checks.
3. **Entity-Attribute-Value** (one row per entry per field, with all values stored as strings): an entry
   is one row with typed JSON values (numbers, booleans and strings), and its schema is defined by `template_field`.
4. **Keyless Entry:** every relationship has a real foreign key with a deliberate `ON DELETE` rule.
5. **Readable Passwords:** only bcrypt hashes are stored.
6. **SQL Injection:** every query uses `?` placeholders, never string-built SQL with user input.

## Security notes

- Owner checks run in middleware (`middleware/ownership.js`). An entry must belong to the list in the URL,
  so a list owner can't reach another list's entries through their own list's URL.
- Cookies are `httpOnly` and `sameSite=lax`, plus `secure` in production. Each login gets a fresh session ID,
  which prevents session fixation.
- Login errors don't reveal whether an account exists.
- All output is HTML-escaped by EJS. URL columns only accept `http(s)` links, so a stored `javascript:` link
  can't run.
- Multi-step writes such as creating or editing templates and applying new rules run in transactions.

## Tests

`npm test` runs the unit tests for the validation engine and the template form parser, using Node's
built-in test runner. They include the examples from the project spec (Contact, Survey Response, the
`busy/away/available` dropdown).

## Deploying to Render

`render.yaml` is a Render Blueprint. In Render, choose **New → Blueprint**, pick this repo, and fill in the
`DB_*` and `MONGO_URL` values. Render generates `SESSION_SECRET` and `MONGO_CRYPTO_SECRET` itself.
MongoDB Atlas must allow connections from `0.0.0.0/0`.

## Known limitations

- Entry data is stored by column name. If you rename a column in a new version, old entries can't carry
  their value over automatically when they're moved to that version. Fill it with a default or edit them.
