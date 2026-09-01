# Top Edge PM

A Jira-style project management tool for Top Edge Technologies. Everything that
should be draggable is draggable: task cards, board columns, sprints, projects,
and the people you assign work to.

React 19 + Vite on the front, Express + SQLite on the back. No native modules —
the database runs on Node's built-in `node:sqlite`, so there is nothing to compile.

## Running it

```bash
npm install
```

### For the team, on the office network

```bash
npm start
```

This builds the front end and serves the whole app — pages and API — from a
single port, bound to every network interface. The startup banner prints the URL
to share:

```
  Top Edge PM is running
  Local:    http://localhost:4000
  Network:  http://192.168.92.71:4000
```

Anyone on the same network opens that Network URL. Because one server serves both
the app and the API, there is no proxy and no cross-origin setup to get wrong.

Re-run `npm start` after changing any front-end code — the browser is served the
built files, not your working copy. `npm run serve` skips the rebuild.

> Your machine's IP is handed out by DHCP and can change after a reboot. If the
> URL stops working, restart the server and read the new one off the banner, or
> ask IT for a fixed address or a DNS name.

### For development

```bash
npm run dev
```

Vite on `5173` with hot reload, API on `4000`, `/api` proxied. Also reachable
across the network — Vite prints its own Local and Network URLs.

On first run the server imports `data/employees.csv` automatically and builds one
project per department.

### If nobody can reach it

1. Confirm the server says `Network:` and not just `Local:`.
2. From another machine: `curl http://<your-ip>:4000/api/health`.
3. Windows Firewall must allow inbound Node on the profile your network uses.
   This machine's network (`TOPEDGE.COM`) is a Domain profile and already has an
   allow rule. On a network where it does not, run this once as Administrator:

```powershell
New-NetFirewallRule -DisplayName "Top Edge PM" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow
```

### Signing in

Every imported employee gets an account keyed to their work email. They all start
with the same password:

| | |
|---|---|
| Email | any address from the CSV, e.g. `usman_khan@topedgetechnologies.com` |
| Password | `topedge123` |

Change it from the avatar menu in the top right. To use a different starting
password, set `DEFAULT_PASSWORD` before seeding.

## Drag and drop

| Where | What you can drag |
|---|---|
| Board | Task cards between columns and up/down within a column |
| Board | The columns themselves, by the `⠿` handle in the column header |
| Board / Backlog | Anyone from the **Team** panel onto a task card to assign it |
| Backlog | Tasks between the backlog and any sprint, and within a sprint |
| Backlog | Sprints, to reorder them |
| Sidebar | Projects, to reorder them |

Ordering uses a fractional rank: a dropped item takes the midpoint of its two
neighbours, so a move writes one row instead of renumbering the list. Ranks are
rebalanced automatically if they ever converge.

Every drag updates the UI immediately and rolls back if the server rejects it.

## Roles

Roles are derived from job titles during the import.

- **admin** — the Management department, plus any "Head of" / "Director" title.
  Can create and delete projects, edit employees, reset passwords.
- **manager** — anyone with "Team Lead", "Lead", "Manager", "Supervisor" or "HOD"
  in their title. Can create projects, columns and sprints, and delete any task.
- **member** — everyone else. Full use of the boards; can delete only tasks they
  reported.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web together |
| `npm run dev:api` | API only |
| `npm run dev:web` | Vite only |
| `npm run seed` | Import the CSV if the database is empty |
| `npm run seed:force` | Wipe everything and re-import |
| `npm run demo` | Replace all tasks with a realistic sample set |
| `npm run build` | Production build of the front end |
| `npm run lint` | oxlint |

## Layout

```
server/
  db.js            schema, connection, fractional ranking
  seed.js          CSV → employees, projects, columns, sprints
  demo.js          sample tasks
  csv.js           RFC-4180 parser
  auth.js          login, JWT, role guards
  routes/          employees, projects + columns, tasks, sprints
  index.js         Express app
src/
  api.js           typed fetch wrapper
  dnd.js           sensors and rank maths shared by every draggable surface
  context/         auth
  components/      board column, task card, people panel, task detail, shared UI
  pages/           Login, Dashboard, Board, Backlog, Team
data/
  employees.csv    source of truth for the team
  pm.db            SQLite database (created on first run)
```

## Data model

`employees` come from the CSV and never lose their original Emp ID. Departments
are normalised on import — the sheet contained both "App Studio" and "Apps
Studio", and both "Games" and "Games Development".

`projects` own `board_columns` and `sprints`. A `task` points at one column and
optionally one sprint; a task with no sprint is in the backlog. `comments` and
`activity` hang off tasks.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `API_PORT` | `4000` | Port the server listens on |
| `HOST` | `0.0.0.0` | Bind address. Set to `127.0.0.1` for local-only |
| `JWT_SECRET` | generated once into `data/jwt.secret` | Session signing key |
| `TOKEN_TTL` | `12h` | How long a login lasts |
| `ALLOWED_ORIGINS` | none | Comma-separated origins allowed to call the API cross-origin. Not needed for normal use |
| `DEFAULT_PASSWORD` | `topedge123` | Password given to every seeded account |
| `EMPLOYEE_CSV` | `data/employees.csv` | Alternative import path |

Deleting `data/jwt.secret` signs everyone out.

## Known limits now that it is on the network

- **Everyone shares one starting password.** Until each person changes theirs
  from the avatar menu, anyone who knows the pattern can sign in as anyone —
  including as an admin. There is no forced change on first login yet.
- **Traffic is plain HTTP.** Passwords cross the network unencrypted. Acceptable
  on a trusted office LAN; not acceptable over the internet or on guest Wi-Fi.
- **The server runs only while the terminal is open.** For a permanent service,
  run it under a process manager or as a Windows service.
- **The IP comes from DHCP** and can change on reboot.
- **`data/pm.db` is the only copy of the data.** Nothing backs it up.
