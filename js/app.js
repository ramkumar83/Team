/**
 * Student Origin Map — application logic.
 * Data model per student:
 *   { id, name, level, department, homeState, homeCity, joinYear, status, email, notes }
 * level: "PhD" | "M.Tech" | "M.S." | "Other"
 * status: "Active" | "Alumni"
 *
 * Persistence: browser localStorage (per-browser). The seed dataset in
 * seed-data.js is copied into localStorage on first run only; after that
 * localStorage is the single source of truth. Use Export/Import to move
 * data between browsers or to update the checked-in seed file.
 */

(function () {
  const STORAGE_KEY = "studentMap.students.v1";

  const LEVEL_COLORS = {
    "PhD": "#7c3aed",
    "M.Tech": "#0284c7",
    "M.S.": "#0284c7",
    "Other": "#d97706"
  };
  const ALUMNI_COLOR = "#9ca3af";
  const LEVELS = ["PhD", "M.Tech", "M.S.", "Other"];

  let students = [];
  let map, markerLayer;
  let activeLevelFilters = new Set(LEVELS);
  let stateFilter = "";
  let searchTerm = "";
  let editingId = null;

  // ---------- Storage ----------
  function loadStudents() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error("Could not parse saved data, falling back to seed data.", e);
      }
    }
    return JSON.parse(JSON.stringify(SEED_STUDENTS));
  }

  function saveStudents() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  }

  // ---------- Coordinates ----------
  function coordsFor(student) {
    const city = CITY_COORDS[student.homeCity];
    if (city) return [city.lat, city.lng];
    const state = STATE_CENTROIDS[student.homeState];
    if (state) return state;
    return null;
  }

  function colorFor(student) {
    if (student.status === "Alumni") return ALUMNI_COLOR;
    return LEVEL_COLORS[student.level] || LEVEL_COLORS["Other"];
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
        return '<div class="legend-row"><span class="dot" style="background:' + LEVEL_COLORS[lvl] + '"></span>' + lvl + "</div>";
      }).join("");
      rows += '<div class="legend-row"><span class="dot" style="background:' + ALUMNI_COLOR + '"></span>Alumni</div>';
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
        const color = colorFor(g.students[0]);

        const marker = L.circleMarker([lat, lng], {
          radius: radius,
          fillColor: color,
          fillOpacity: 0.85,
          color: "#fff",
          weight: 2
        });

        marker.bindPopup(buildPopupHtml(g.students), { maxWidth: 280, maxHeight: 260 });
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
        '<div class="p-actions"><a data-action="edit" data-id="' + s.id + '">Edit</a><a data-action="delete" data-id="' + s.id + '">Delete</a></div>' +
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
      const color = colorFor(s);
      return '<div class="student-item" data-id="' + s.id + '">' +
        '<span class="marker-dot" style="background:' + color + '"></span>' +
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

    if (editingId) {
      const idx = students.findIndex(function (x) { return x.id === editingId; });
      if (idx !== -1) students[idx] = Object.assign({ id: editingId }, data);
      toast("Student updated");
    } else {
      data.id = "s-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      students.push(data);
      toast("Student added");
    }

    saveStudents();
    closeModal();
    renderAll();
  }

  function deleteStudent(id) {
    const s = students.find(function (x) { return x.id === id; });
    if (!s) return;
    if (!confirm('Delete "' + s.name + '"? This cannot be undone.')) return;
    students = students.filter(function (x) { return x.id !== id; });
    saveStudents();
    map.closePopup();
    closeModal();
    renderAll();
    toast("Student deleted");
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
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const parsed = JSON.parse(reader.result);
          if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of students");
          if (!confirm("Import " + parsed.length + " students? This will replace all data currently in this browser.")) return;
          students = parsed.map(function (s, i) {
            return Object.assign({ id: s.id || ("s-import-" + Date.now() + "-" + i) }, s);
          });
          saveStudents();
          renderAll();
          toast("Imported " + students.length + " students");
        } catch (err) {
          alert("Could not import file: " + err.message);
        }
        e.target.value = "";
      };
      reader.readAsText(file);
    };
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

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", function () {
    students = loadStudents();
    saveStudents();

    initMap();
    initFilterChips();
    initStateFilter();
    initSearch();
    initModal();
    initImportExport();

    renderAll();
  });
})();
