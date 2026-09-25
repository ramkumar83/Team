/**
 * Student Origin Map — application logic.
 * Data model per student:
 *   { id, name, level, department, homeState, homeCity, joinYear, status, email, notes }
 * level: "PhD" | "M.Tech" | "M.S." | "Other"
 * status: "Active" | "Alumni"
 *
 * Persistence: Firebase Firestore, shared in real time across every browser
 * and device that opens this page (see README.md for one-time setup).
 * Editing (add/edit/delete/import) requires signing in with the single
 * editor account you create in Firebase Authentication; everyone else sees
 * a live, read-only map. Security is enforced both in this UI and, more
 * importantly, by the Firestore Security Rules in your Firebase project —
 * see README.md for the exact rules to paste in.
 */

import { STATE_CENTROIDS, INDIA_STATES, CITY_COORDS, CITY_NAMES } from "./geo-data.js";
import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "12.19.0";

const LEVEL_COLORS = {
  "PhD": "#7c3aed",
  "M.Tech": "#0284c7",
  "M.S.": "#0284c7",
  "Other": "#d97706"
};
const LEVELS = ["PhD", "M.Tech", "M.S.", "Other"];

let students = [];
let map, markerLayer;
let activeLevelFilters = new Set(LEVELS);
let stateFilter = "";
let searchTerm = "";
let editingId = null;
let currentUser = null;

// Firebase pieces are loaded lazily (below) so the map, search, and filters
// always work even if Firebase isn't configured yet or the CDN is
// unreachable — only editing/sync depend on it.
let db, auth, studentsCol;
let firebaseReady = false;
let getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch;
let getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut;

const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

// ---------- Coordinates & styling ----------
function coordsFor(student) {
  const city = CITY_COORDS[student.homeCity];
  if (city) return [city.lat, city.lng];
  const state = STATE_CENTROIDS[student.homeState];
  if (state) return state;
  return null;
}

function levelColor(level) {
  return LEVEL_COLORS[level] || LEVEL_COLORS["Other"];
}

// Active students render as a solid filled dot in their program color.
// Alumni render as a hollow dashed ring in the same program color, so
// program is still readable at a glance but status is clearly different
// (rather than flattening everyone into one washed-out gray).
function styleForGroup(groupStudents) {
  const color = levelColor(groupStudents[0].level);
  const allAlumni = groupStudents.every(function (s) { return s.status === "Alumni"; });
  if (allAlumni) {
    return { fillColor: "#ffffff", fillOpacity: 0.95, color: color, weight: 3, dashArray: "4,3" };
  }
  return { fillColor: color, fillOpacity: 0.88, color: "#ffffff", weight: 2, dashArray: null };
}

function canEdit() {
  return !!currentUser;
}

// ---------- Map setup ----------
function initMap() {
  map = L.map("map", {
    zoomControl: true,
    minZoom: 4,
    maxZoom: 13
  }).setView([22.9734, 78.6569], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  const bounds = L.latLngBounds([6.5, 67.5], [37.5, 98.5]);
  map.setMaxBounds(bounds.pad(0.3));

  markerLayer = L.layerGroup().addTo(map);

  addLegend();
}

function addLegend() {
  const legend = L.control({ position: "bottomright" });
  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "legend-box");
    let rows = LEVELS.map(function (lvl) {
      return '<div class="legend-row"><span class="dot" style="background:' + LEVEL_COLORS[lvl] + '"></span>' + lvl + " (active)</div>";
    }).join("");
    rows += '<div class="legend-row"><span class="dot ring" style="border-color:' + LEVEL_COLORS["PhD"] + '"></span>Alumni (ring = program color)</div>';
    div.innerHTML = '<div class="legend-title">Legend</div>' + rows;
    return div;
  };
  legend.addTo(map);
}

// ---------- Filtering ----------
function matchesFilters(student) {
  if (!activeLevelFilters.has(student.level)) return false;
  if (stateFilter && student.homeState !== stateFilter) return false;
  if (searchTerm) {
    const hay = (student.name + " " + student.department + " " + student.homeCity + " " + student.homeState).toLowerCase();
    if (!hay.includes(searchTerm)) return false;
  }
  return true;
}

function getFiltered() {
  return students.filter(matchesFilters);
}

// ---------- Rendering: markers ----------
function renderMarkers() {
  markerLayer.clearLayers();
  const filtered = getFiltered();

  // group by rounded coordinate + level so same-city same-level students share one marker
  const groups = {};
  filtered.forEach(function (s) {
    const c = coordsFor(s);
    if (!c) return;
    const key = c[0].toFixed(2) + "," + c[1].toFixed(2) + "|" + s.level;
    if (!groups[key]) groups[key] = { coords: c, level: s.level, students: [] };
    groups[key].students.push(s);
  });

  // offset groups that share the same base coordinate but differ by level,
  // so markers don't fully overlap
  const byCoord = {};
  Object.values(groups).forEach(function (g) {
    const ck = g.coords[0].toFixed(2) + "," + g.coords[1].toFixed(2);
    if (!byCoord[ck]) byCoord[ck] = [];
    byCoord[ck].push(g);
  });

  Object.values(byCoord).forEach(function (groupList) {
    groupList.forEach(function (g, idx) {
      let lat = g.coords[0], lng = g.coords[1];
      if (groupList.length > 1) {
        const angle = (idx / groupList.length) * 2 * Math.PI;
        lat += Math.cos(angle) * 0.12;
        lng += Math.sin(angle) * 0.12;
      }
      const count = g.students.length;
      const radius = Math.min(8 + count * 2.5, 22);
      const style = styleForGroup(g.students);

      const markerOpts = Object.assign({ radius: radius }, style);
      if (!markerOpts.dashArray) delete markerOpts.dashArray;

      const marker = L.circleMarker([lat, lng], markerOpts);

      marker.bindPopup(buildPopupHtml(g.students), { maxWidth: 280, maxHeight: 280 });
      marker.on("popupopen", attachPopupHandlers);
      marker.addTo(markerLayer);
    });
  });
}

function buildPopupHtml(list) {
  const city = list[0].homeCity || list[0].homeState;
  let html = '<div class="popup-city">' + escapeHtml(city) + " &middot; " + list.length + (list.length === 1 ? " student" : " students") + "</div>";
  list.forEach(function (s) {
    html += '<div class="popup-student" data-id="' + s.id + '">' +
      '<div class="p-name">' + escapeHtml(s.name) + "</div>" +
      '<div class="p-detail">' + escapeHtml(s.level) + (s.department ? " &middot; " + escapeHtml(s.department) : "") + "</div>" +
      '<div class="p-detail">' + escapeHtml(s.homeCity ? s.homeCity + ", " : "") + escapeHtml(s.homeState) + (s.joinYear ? " &middot; joined " + s.joinYear : "") + "</div>" +
      (s.status === "Alumni" ? '<div class="p-detail">Status: Alumni</div>' : "") +
      (s.email ? '<div class="p-detail">' + escapeHtml(s.email) + "</div>" : "") +
      (canEdit() ? '<div class="p-actions"><a data-action="edit" data-id="' + s.id + '">Edit</a><a data-action="delete" data-id="' + s.id + '">Delete</a></div>' : "") +
      "</div>";
  });
  return html;
}

function attachPopupHandlers() {
  document.querySelectorAll('.popup-student a[data-action]').forEach(function (el) {
    el.onclick = function () {
      const id = el.getAttribute("data-id");
      const action = el.getAttribute("data-action");
      if (action === "edit") openModal(id);
      if (action === "delete") deleteStudent(id);
    };
  });
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// ---------- Rendering: sidebar list + stats ----------
function renderList() {
  const wrap = document.getElementById("studentList");
  const filtered = getFiltered().slice().sort(function (a, b) { return a.name.localeCompare(b.name); });

  if (filtered.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No students match the current filters.</div>';
    return;
  }

  wrap.innerHTML = filtered.map(function (s) {
    const color = levelColor(s.level);
    const dotStyle = s.status === "Alumni"
      ? "background:#fff; border-color:" + color
      : "background:" + color + "; border-color:" + color;
    return '<div class="student-item" data-id="' + s.id + '">' +
      '<span class="marker-dot" style="' + dotStyle + '"></span>' +
      '<div class="meta">' +
      '<div class="name">' + escapeHtml(s.name) + "</div>" +
      '<div class="sub">' + escapeHtml(s.homeCity ? s.homeCity + ", " : "") + escapeHtml(s.homeState) + "</div>" +
      '<div class="badges"><span class="badge">' + escapeHtml(s.level) + "</span>" +
      (s.department ? '<span class="badge">' + escapeHtml(s.department) + "</span>" : "") +
      (s.status === "Alumni" ? '<span class="badge alumni">Alumni</span>' : "") +
      "</div></div></div>";
  }).join("");

  wrap.querySelectorAll(".student-item").forEach(function (el) {
    el.onclick = function () {
      const id = el.getAttribute("data-id");
      focusStudent(id);
    };
  });
}

function focusStudent(id) {
  const s = students.find(function (x) { return x.id === id; });
  if (!s) return;
  const c = coordsFor(s);
  if (!c) return;
  map.flyTo(c, 8, { duration: 0.6 });
  setTimeout(function () {
    markerLayer.eachLayer(function (layer) {
      const ll = layer.getLatLng();
      if (Math.abs(ll.lat - c[0]) < 0.2 && Math.abs(ll.lng - c[1]) < 0.2) {
        layer.openPopup();
      }
    });
  }, 650);
}

function renderStats() {
  const filtered = getFiltered();
  document.getElementById("statTotal").textContent = filtered.length;
  document.getElementById("statPhd").textContent = filtered.filter(function (s) { return s.level === "PhD"; }).length;
  document.getElementById("statMtech").textContent = filtered.filter(function (s) { return s.level === "M.Tech"; }).length;
  const states = new Set(filtered.map(function (s) { return s.homeState; }));
  document.getElementById("statStates").textContent = states.size;
}

function renderAll() {
  renderMarkers();
  renderList();
  renderStats();
}

// ---------- Filters UI ----------
function initFilterChips() {
  const row = document.getElementById("levelChips");
  row.innerHTML = LEVELS.map(function (lvl) {
    return '<span class="chip active" data-level="' + lvl + '" style="border-color:' + LEVEL_COLORS[lvl] + '; background:' + LEVEL_COLORS[lvl] + '"><span class="dot" style="background:#fff"></span>' + lvl + "</span>";
  }).join("");

  row.querySelectorAll(".chip").forEach(function (chip) {
    chip.onclick = function () {
      const lvl = chip.getAttribute("data-level");
      const color = LEVEL_COLORS[lvl];
      if (activeLevelFilters.has(lvl)) {
        activeLevelFilters.delete(lvl);
        chip.classList.remove("active");
        chip.style.background = "#fff";
        chip.style.color = "var(--text-muted)";
      } else {
        activeLevelFilters.add(lvl);
        chip.classList.add("active");
        chip.style.background = color;
        chip.style.color = "#fff";
      }
      renderAll();
    };
  });
}

function initStateFilter() {
  const sel = document.getElementById("stateFilter");
  sel.innerHTML = '<option value="">All states</option>' +
    INDIA_STATES.slice().sort().map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("");
  sel.onchange = function () {
    stateFilter = sel.value;
    renderAll();
  };
}

function initSearch() {
  const input = document.getElementById("searchInput");
  input.oninput = function () {
    searchTerm = input.value.trim().toLowerCase();
    renderAll();
  };
}

// ---------- Modal (Add/Edit) ----------
function initModal() {
  document.getElementById("addStudentBtn").onclick = function () { openModal(null); };
  document.getElementById("modalCloseBtn").onclick = closeModal;
  document.getElementById("modalCancelBtn").onclick = closeModal;
  document.getElementById("modalOverlay").onclick = function (e) {
    if (e.target.id === "modalOverlay") closeModal();
  };

  const stateSel = document.getElementById("f_homeState");
  stateSel.innerHTML = INDIA_STATES.slice().sort().map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("");

  const cityList = document.getElementById("cityDatalist");
  cityList.innerHTML = CITY_NAMES.map(function (c) { return '<option value="' + c + '">'; }).join("");

  document.getElementById("studentForm").onsubmit = function (e) {
    e.preventDefault();
    saveFormAsStudent();
  };

  document.getElementById("deleteFromModalBtn").onclick = function () {
    if (editingId) deleteStudent(editingId);
  };
}

function openModal(id) {
  if (!canEdit()) { openAuthModal(); return; }
  editingId = id;
  const form = document.getElementById("studentForm");
  form.reset();
  document.getElementById("modalTitle").textContent = id ? "Edit Student" : "Add Student";
  document.getElementById("deleteFromModalBtn").classList.toggle("hidden", !id);

  if (id) {
    const s = students.find(function (x) { return x.id === id; });
    if (s) {
      document.getElementById("f_name").value = s.name || "";
      document.getElementById("f_level").value = s.level || "PhD";
      document.getElementById("f_department").value = s.department || "";
      document.getElementById("f_homeState").value = s.homeState || "";
      document.getElementById("f_homeCity").value = s.homeCity || "";
      document.getElementById("f_joinYear").value = s.joinYear || "";
      document.getElementById("f_status").value = s.status || "Active";
      document.getElementById("f_email").value = s.email || "";
      document.getElementById("f_notes").value = s.notes || "";
    }
  } else {
    document.getElementById("f_level").value = "PhD";
    document.getElementById("f_status").value = "Active";
    document.getElementById("f_joinYear").value = new Date().getFullYear();
  }

  document.getElementById("modalOverlay").hidden = false;
}

function closeModal() {
  document.getElementById("modalOverlay").hidden = true;
  editingId = null;
}

function saveFormAsStudent() {
  const name = document.getElementById("f_name").value.trim();
  const homeState = document.getElementById("f_homeState").value;
  if (!name || !homeState) return;

  const data = {
    name: name,
    level: document.getElementById("f_level").value,
    department: document.getElementById("f_department").value.trim(),
    homeState: homeState,
    homeCity: document.getElementById("f_homeCity").value.trim(),
    joinYear: document.getElementById("f_joinYear").value ? parseInt(document.getElementById("f_joinYear").value, 10) : null,
    status: document.getElementById("f_status").value,
    email: document.getElementById("f_email").value.trim(),
    notes: document.getElementById("f_notes").value.trim()
  };

  const id = editingId || ("s-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7));
  data.id = id;

  setDoc(doc(studentsCol, id), data)
    .then(function () {
      toast(editingId ? "Student updated" : "Student added");
      closeModal();
    })
    .catch(function (err) {
      alert("Could not save: " + err.message);
    });
}

function deleteStudent(id) {
  if (!canEdit()) { openAuthModal(); return; }
  const s = students.find(function (x) { return x.id === id; });
  if (!s) return;
  if (!confirm('Delete "' + s.name + '"? This cannot be undone.')) return;
  deleteDoc(doc(studentsCol, id))
    .then(function () {
      map.closePopup();
      closeModal();
      toast("Student deleted");
    })
    .catch(function (err) {
      alert("Could not delete: " + err.message);
    });
}

// ---------- Import / Export ----------
function initImportExport() {
  document.getElementById("exportBtn").onclick = function () {
    const blob = new Blob([JSON.stringify(students, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Exported " + students.length + " students");
  };

  document.getElementById("importInput").onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!canEdit()) { openAuthModal(); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of students");
        if (!confirm("Add " + parsed.length + " students from this file to the shared list? Existing students are kept; entries with a matching id are overwritten.")) return;
        const batch = writeBatch(db);
        parsed.forEach(function (s, i) {
          const id = s.id || ("s-import-" + Date.now() + "-" + i);
          const data = Object.assign({}, s, { id: id });
          batch.set(doc(studentsCol, id), data);
        });
        batch.commit()
          .then(function () { toast("Imported " + parsed.length + " students"); })
          .catch(function (err) { alert("Import failed: " + err.message); });
      } catch (err) {
        alert("Could not import file: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  };
}

// ---------- Auth ----------
function initAuthUiHandlers() {
  document.getElementById("signInBtn").onclick = function () {
    if (!isConfigured) { toast("Not connected yet — see README.md for setup"); return; }
    openAuthModal();
  };
  document.getElementById("signOutBtn").onclick = function () {
    if (!firebaseReady) return;
    signOut(auth).then(function () { toast("Signed out"); });
  };
  document.getElementById("authModalCloseBtn").onclick = closeAuthModal;
  document.getElementById("authModalCancelBtn").onclick = closeAuthModal;
  document.getElementById("authModalOverlay").onclick = function (e) {
    if (e.target.id === "authModalOverlay") closeAuthModal();
  };
  document.getElementById("authForm").onsubmit = function (e) {
    e.preventDefault();
    const errEl = document.getElementById("authError");
    if (!firebaseReady) { errEl.textContent = "Still connecting — try again in a moment."; return; }
    const email = document.getElementById("auth_email").value.trim();
    const password = document.getElementById("auth_password").value;
    errEl.textContent = "";
    signInWithEmailAndPassword(auth, email, password)
      .then(function () {
        closeAuthModal();
        toast("Signed in");
      })
      .catch(function (err) {
        errEl.textContent = friendlyAuthError(err);
      });
  };
}

function initAuthState() {
  onAuthStateChanged(auth, function (user) {
    currentUser = user;
    updateAuthUI();
    renderAll();
  });
}

function friendlyAuthError(err) {
  const code = err && err.code;
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Incorrect email or password.";
  }
  if (code === "auth/invalid-email") return "That doesn't look like a valid email address.";
  if (code === "auth/too-many-requests") return "Too many attempts — please wait a moment and try again.";
  if (code === "auth/network-request-failed") return "Network error — check your connection and try again.";
  return "Could not sign in: " + (err && err.message ? err.message : "unknown error");
}

function openAuthModal() {
  document.getElementById("authError").textContent = "";
  const emailField = document.getElementById("auth_email");
  if (!emailField.value) emailField.value = "ram.iitbombay@gmail.com";
  document.getElementById("authModalOverlay").hidden = false;
}

function closeAuthModal() {
  document.getElementById("authModalOverlay").hidden = true;
}

function updateAuthUI() {
  const signedIn = canEdit();
  document.getElementById("addStudentBtn").classList.toggle("hidden", !signedIn);
  document.getElementById("importLabel").classList.toggle("hidden", !signedIn);
  document.getElementById("signInBtn").classList.toggle("hidden", signedIn);
  document.getElementById("signedInBadge").classList.toggle("hidden", !signedIn);
  if (signedIn) {
    document.getElementById("signedInEmail").textContent = currentUser.email;
  }
}

// ---------- Toast ----------
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
}

// ---------- Setup banner (Firebase not configured yet) ----------
function showSetupBanner() {
  const banner = document.getElementById("setupBanner");
  if (banner) banner.hidden = false;
}

async function initFirebase() {
  try {
    const [appMod, firestoreMod, authMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-firestore.js"),
      import("https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/firebase-auth.js")
    ]);

    getFirestore = firestoreMod.getFirestore;
    collection = firestoreMod.collection;
    doc = firestoreMod.doc;
    onSnapshot = firestoreMod.onSnapshot;
    setDoc = firestoreMod.setDoc;
    deleteDoc = firestoreMod.deleteDoc;
    writeBatch = firestoreMod.writeBatch;

    getAuth = authMod.getAuth;
    onAuthStateChanged = authMod.onAuthStateChanged;
    signInWithEmailAndPassword = authMod.signInWithEmailAndPassword;
    signOut = authMod.signOut;

    const firebaseApp = appMod.initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
    studentsCol = collection(db, "students");
    firebaseReady = true;

    initAuthState();

    onSnapshot(studentsCol, function (snapshot) {
      students = snapshot.docs.map(function (d) { return d.data(); });
      renderAll();
    }, function (err) {
      console.error("Firestore sync error:", err);
      toast("Could not load shared data — check your connection or Firestore rules");
    });
  } catch (err) {
    console.error("Could not load Firebase:", err);
    toast("Could not connect to the shared database — check your connection");
  }
}

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", function () {
  initMap();
  initFilterChips();
  initStateFilter();
  initSearch();
  initModal();
  initImportExport();
  initAuthUiHandlers();
  renderAll();

  if (!isConfigured) {
    showSetupBanner();
    return;
  }

  initFirebase();
});
