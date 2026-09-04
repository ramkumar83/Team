# Research Scholars Map

An interactive map of M.Tech and PhD students by home state/city, built for
tracking research scholars across India. Pins are color-coded by program
(PhD / M.Tech / M.S. / Other), with a separate muted color for alumni.

No backend, no build step — it's a static site (HTML/CSS/JS) that runs by
just opening `index.html`, or hosted for free via GitHub Pages.

## Features

- Real India map (OpenStreetMap tiles via Leaflet) with pan/zoom, showing
  actual state boundaries, cities, and geography.
- Color-coded pins per student's home city (falls back to the state's
  location if the city isn't in the built-in list).
- Multiple students in the same city are grouped into one pin, sized by
  count, with all names listed in the popup.
- Sidebar: live search (name/department/city), filter by program, filter
  by state, and a scrollable roster list — click any student to fly to
  their pin.
- Add / Edit / Delete students via a form (modal), or from a pin's popup.
- Export your roster to a `.json` file (backup), and Import a `.json` file
  back in.

## Running it

Just open `index.html` in a browser — no install needed. Or, to make it
reachable at a URL for your students/collaborators:

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In the repo's **Settings → Pages**, set the source to the `main` branch, root folder.
3. GitHub will publish it at `https://<your-username>.github.io/<repo-name>/`.

## How data is stored

All edits (add/edit/delete) are saved to your browser's **local storage** —
they persist across reloads on the same browser/device, but are **not**
shared automatically with other people or other devices.

- `js/seed-data.js` is the starting roster loaded the very first time the
  app runs in a browser (it currently contains 3 placeholder "Sample
  Student" entries — delete these once you add real students).
- After that first load, all reads/writes go to local storage only.

**To back up your data or share it with someone else:** click **Export
JSON** in the header to download your current roster as a file. Someone
else can then click **Import JSON** and pick that file to load it into
their browser (this replaces whatever is currently in their browser).

**To make your current roster the new default for anyone opening the app
for the first time:** export your JSON, then replace the contents of the
`SEED_STUDENTS` array in `js/seed-data.js` with it, and commit/push.

## Data format

Each student is a plain object:

```json
{
  "id": "s-171234567-ab3f2",
  "name": "Priya Sharma",
  "level": "PhD",
  "department": "Computer Science & Engineering",
  "homeState": "West Bengal",
  "homeCity": "Kolkata",
  "joinYear": 2023,
  "status": "Active",
  "email": "priya@iitb.ac.in",
  "notes": ""
}
```

- `level`: `"PhD"`, `"M.Tech"`, `"M.S."`, or `"Other"`.
- `status`: `"Active"` or `"Alumni"` (alumni are shown in a muted gray pin).
- `homeCity` should match a name in `js/geo-data.js` (`CITY_COORDS`) for an
  accurate pin; otherwise the pin is placed at the state's approximate
  center. You can add more cities to that file at any time — it's a plain
  JS object of `"City": { lat, lng, state }`.
- `homeState` must match one of the names in `INDIA_STATES`
  (`js/geo-data.js`) so filtering and fallback placement work.

## File structure

```
index.html        Page structure / layout
css/style.css      Styling
js/geo-data.js      Indian states + city coordinate lookup
js/seed-data.js     Starter/placeholder roster
js/app.js           Map, filters, list, add/edit/delete, import/export
```

## Extending it

Some natural next steps if you outgrow local-storage-per-browser:

- Swap local storage for a small shared backend (e.g. a simple database
  and API) so all edits sync across devices automatically.
- Add more fields (advisor/co-advisor, funding source, thesis title,
  graduation date, photo).
- Add a "current city" pin (e.g. IIT Bombay, Powai) with lines connecting
  to each student's home city, to visualize the network at a glance.
