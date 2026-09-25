# Research Scholars Map

An interactive map of M.Tech and PhD students by home state/city, built for
tracking research scholars across India. Pins are color-coded by program
(PhD / M.Tech / M.S. / Other): **active** students are a solid dot in their
program color, **alumni** are a hollow dashed ring in that same color, so
program is still readable at a glance and alumni status doesn't get lost in
one flat gray.

It's a static site (HTML/CSS/JS, no build step) that talks to a free
Firebase project for data, so:

- Everyone who opens the page sees the **same live data**, in real time,
  from any browser or device.
- Only someone signed in with the one editor account you create can
  **add, edit, delete, or import** students. Everyone else gets a
  read-only view.

## One-time setup (Firebase) — do this first

Without this step the app shows a "not connected" banner and can't load or
save any students. It takes about 10 minutes and is free for a roster this
size (Firebase's free "Spark" tier).

1. Go to **https://console.firebase.google.com**, sign in with a Google
   account, and click **Add project**. Name it anything (e.g. "research-scholars-map").
   You can skip Google Analytics for this project.
2. **Create the database:** in the left sidebar, go to **Build → Firestore
   Database → Create database**. Choose a region close to you, and start in
   **production mode**.
3. **Set the security rules:** still in Firestore, open the **Rules** tab
   and replace the contents with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /students/{studentId} {
         allow read: if true;
         allow write: if request.auth != null;
       }
     }
   }
   ```

   This lets anyone with the link view the map, but only a signed-in user
   can write. For tighter security (only *you* can write, even if someone
   else somehow creates a Firebase account), use this instead, replacing
   the email with your own sign-in email:

   ```
   allow write: if request.auth != null
     && request.auth.token.email == "ram.iitbombay@gmail.com";
   ```

   Click **Publish** after editing.
4. **Turn on sign-in:** go to **Build → Authentication → Get started**, click
   the **Sign-in method** tab, enable **Email/Password**, and save.
5. **Create your editor account:** in Authentication, go to the **Users**
   tab → **Add user**, enter the email and password you want to sign in
   with on the map (e.g. `ram.iitbombay@gmail.com` and a password of your
   choice). This is the only account that can edit.
6. **Get your web config:** click the gear icon → **Project settings** →
   scroll to **Your apps** → click the **`</>`** (web) icon → register an
   app (any nickname) → it shows a `firebaseConfig` object. Copy the
   values into `js/firebase-config.js` in this repo, e.g.:

   ```js
   export const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "research-scholars-map.firebaseapp.com",
     projectId: "research-scholars-map",
     storageBucket: "research-scholars-map.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

   These values are not secret — Firebase web config is meant to be public;
   your Firestore rules above are what actually enforce access control.
7. **Authorize your domain:** still in Authentication, open **Settings →
   Authorized domains** and add the domain you'll host this on (GitHub
   Pages' `*.github.io` needs to be added explicitly — `localhost` is
   already included by default for local testing).
8. Commit and push `js/firebase-config.js` with your real values, then open
   the site: click **Sign in to edit** in the header and sign in with the
   account from step 5.

That's it — from then on, every add/edit/delete you make (from any device,
once signed in) appears live for every other visitor.

### A privacy note

Step 3's default rule (`allow read: if true`) makes the roster — names,
home cities, departments, emails if you add them — visible to **anyone
with the link**, even signed out. That matches "a map I can share," but
if you'd rather this be private to people you trust, change it to:

```
allow read: if request.auth != null;
```

and only create Firebase Authentication accounts for the people who should
see it (Firebase's free tier supports multiple users, not just one).

## Running it

Open `index.html` in a browser — no install needed, no server required
beyond the Firebase project above. To make it reachable at a URL:

1. Push this repo to GitHub.
2. In the repo's **Settings → Pages**, set the source to your default
   branch, root folder.
3. GitHub publishes it at `https://<your-username>.github.io/<repo-name>/`.
4. Don't forget step 7 above (add that `github.io` URL as an authorized
   domain in Firebase), or sign-in will fail on the live site.

## Data format

Each student is a document in the Firestore `students` collection (and the
same shape in Export/Import JSON files):

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
- `status`: `"Active"` or `"Alumni"` (alumni render as a hollow ring instead
  of a solid dot).
- `homeCity` should match a name in `js/geo-data.js` (`CITY_COORDS`) for an
  accurate pin; otherwise the pin is placed at the state's approximate
  center. Add more cities to that file any time — it's a plain object of
  `"City": { lat, lng, state }`.
- `homeState` must match one of the names in `INDIA_STATES`
  (`js/geo-data.js`).

`data/sample-students.json` has 3 example entries (one PhD, one M.Tech, one
Alumni) you can load via **Import JSON** once signed in, just to see the
app populated — delete them afterward from the list or their pin popups.

## File structure

```
index.html             Page structure / layout
css/style.css           Styling
css/vendor/leaflet.css  Vendored Leaflet stylesheet (+ images/)
js/vendor/leaflet.js    Vendored Leaflet library
js/geo-data.js          Indian states + city coordinate lookup
js/firebase-config.js   Your Firebase project config (fill this in)
js/app.js               Map, filters, list, auth, Firestore sync, import/export
data/sample-students.json  Optional example roster to try the app with
```

## Extending it

- Add more fields (advisor/co-advisor, funding source, thesis title,
  graduation date, photo).
- Add a "current city" pin (e.g. IIT Bombay, Powai) with lines connecting
  to each student's home city, to visualize the network at a glance.
- Give specific reviewers/collaborators read-only sign-in accounts if you
  tighten the read rule above but still want to share access selectively.
