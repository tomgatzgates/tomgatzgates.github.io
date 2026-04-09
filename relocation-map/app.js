const CSV_PATH = "relocation-map/stations_with_train_times_arriveby.csv";
const LS_KEY = "station-shortlist";

// ── State ────────────────────────────────────────────
let stationData = [];
let shortlist = new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));
let shortlistOnly = false;
let sortKey = "name";

const saveShortlist = () => localStorage.setItem(LS_KEY, JSON.stringify([...shortlist]));

// ── Map ──────────────────────────────────────────────
const map = L.map("map", { scrollWheelZoom: true, zoomControl: false }).setView([51.4, -0.2], 9);
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 18,
}).addTo(map);

const markersLayer = L.layerGroup().addTo(map);
// keep marker refs so we can update popups on star toggle
const markerMap = new Map(); // name -> marker

// ── Gold star marker icon ────────────────────────────
const makeIcon = (starred) => {
  if (!starred) return null; // use circleMarker for normal
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
      <defs>
        <radialGradient id="gg" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#ffe680"/>
          <stop offset="55%" stop-color="#c8972a"/>
          <stop offset="100%" stop-color="#8a5e0a"/>
        </radialGradient>
        <filter id="gs" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.35)"/>
        </filter>
      </defs>
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        fill="url(#gg)" filter="url(#gs)" stroke="#a07020" stroke-width="0.5"/>
    </svg>`,
  });
};

// ── Tab switching ────────────────────────────────────
document.querySelectorAll(".tab-nav").forEach((nav) => {
  nav.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      nav.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.dataset.tab;
      // find sibling panels (inside same parent container)
      const container = nav.closest("#sidebar, #drawer > .drawer-body, #drawer");
      if (container) {
        container.querySelectorAll(".tab-panel").forEach((p) => {
          p.classList.toggle("active", p.id === targetId);
        });
      }
    });
  });
});

// ── Drawer toggle ────────────────────────────────────
const drawer = document.getElementById("drawer");
document.getElementById("drawerToggle").addEventListener("click", () => {
  drawer.classList.toggle("open");
});

// ── Shortlist toggles (desktop + mobile synced) ──────
const deskCheck = document.getElementById("desk-shortlist-check");
const mobCheck = document.getElementById("mob-shortlist-check");

const setShortlistOnly = (val) => {
  shortlistOnly = val;
  deskCheck.checked = val;
  mobCheck.checked = val;
  // Grey out sliders when shortlist mode is on
  document.getElementById("desk-sliders").style.opacity = val ? "0.35" : "1";
  document.getElementById("desk-sliders").style.pointerEvents = val ? "none" : "";
  renderStations();
};

deskCheck.addEventListener("change", () => setShortlistOnly(deskCheck.checked));
mobCheck.addEventListener("change", () => setShortlistOnly(mobCheck.checked));
document.getElementById("desk-shortlist-toggle").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) setShortlistOnly(!shortlistOnly);
});
document.getElementById("mob-shortlist-toggle").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) setShortlistOnly(!shortlistOnly);
});

// ── Slider sync ──────────────────────────────────────
const getVal = (id) => Number(document.getElementById(id).value);
const setDisplay = (id, min, max) => {
  document.getElementById(id).textContent = `${min} – ${max} min`;
};
const updateFill = (wrapId) => {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const fill = wrap.querySelector(".range-track-fill");
  const inputs = wrap.querySelectorAll("input[type='range']");
  const minEl = inputs[0], maxEl = inputs[1];
  const rangeMin = Number(minEl.min), rangeMax = Number(minEl.max);
  const pMin = (Number(minEl.value) - rangeMin) / (rangeMax - rangeMin) * 100;
  const pMax = (Number(maxEl.value) - rangeMin) / (rangeMax - rangeMin) * 100;
  fill.style.left = pMin + "%";
  fill.style.width = Math.max(0, pMax - pMin) + "%";
};

const syncRangePair = (deskPrefix, mobPrefix) => {
  const dMin = document.getElementById(deskPrefix + "Min");
  const dMax = document.getElementById(deskPrefix + "Max");
  const mMin = document.getElementById(mobPrefix + "Min");
  const mMax = document.getElementById(mobPrefix + "Max");
  dMin.addEventListener("input", () => {
    if (+dMin.value > +dMax.value) dMax.value = dMin.value;
    mMin.value = dMin.value; mMax.value = dMax.value;
    renderStations();
  });
  dMax.addEventListener("input", () => {
    if (+dMax.value < +dMin.value) dMin.value = dMax.value;
    mMin.value = dMin.value; mMax.value = dMax.value;
    renderStations();
  });
  mMin.addEventListener("input", () => {
    if (+mMin.value > +mMax.value) mMax.value = mMin.value;
    dMin.value = mMin.value; dMax.value = mMax.value;
    renderStations();
  });
  mMax.addEventListener("input", () => {
    if (+mMax.value < +mMin.value) mMin.value = mMax.value;
    dMin.value = mMin.value; dMax.value = mMax.value;
    renderStations();
  });
};

syncRangePair("deskHorsham", "mobHorsham");
syncRangePair("deskHertford", "mobHertford");
syncRangePair("deskTrain", "mobTrain");

// ── Sort selects (desktop + mobile synced) ───────────
const deskSort = document.getElementById("sort-select");
const mobSort = document.getElementById("mob-sort-select");

const onSortChange = (val) => {
  sortKey = val;
  deskSort.value = val;
  mobSort.value = val;
  renderList();
};

deskSort.addEventListener("change", () => onSortChange(deskSort.value));
mobSort.addEventListener("change", () => onSortChange(mobSort.value));

// ── Badges ───────────────────────────────────────────
const updateBadges = (visible, total) => {
  const text = `${visible} / ${total}`;
  document.getElementById("desk-badge").textContent = text;
  document.getElementById("mob-badge").textContent = text;
};

// ── Toggle star for a station ────────────────────────
const toggleStar = (name) => {
  if (shortlist.has(name)) shortlist.delete(name);
  else shortlist.add(name);
  saveShortlist();
  renderStations();
};

// Event delegation for popup shortlist button — works on iOS
// (inline onclick in Leaflet popup HTML is blocked by WebKit CSP)
map.on("popupopen", (e) => {
  const btn = e.popup.getElement()?.querySelector(".popup-shortlist-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    toggleStar(btn.dataset.stationName);
  });
  // touchend fallback for iOS where click can be swallowed
  btn.addEventListener("touchend", (te) => {
    te.preventDefault();
    toggleStar(btn.dataset.stationName);
  });
});

// ── Popup builder ────────────────────────────────────
const buildPopup = (s) => {
  const starred = shortlist.has(s.name);
  const meta = [s.line, s.county].filter(Boolean).join(" · ");
  return `
    <div class="popup-inner">
      <div class="popup-name">${s.name}</div>
      ${meta ? `<div class="popup-meta">${meta}</div>` : ""}
      <div class="popup-stats">
        <div class="stat-box">
          <span class="stat-label">Horsham</span>
          <span class="stat-value">${s.horsham ?? "–"}</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Hertford</span>
          <span class="stat-value">${s.hertford ?? "–"}</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">London</span>
          <span class="stat-value">${s.train ?? "–"}</span>
        </div>
      </div>
      <button class="popup-shortlist-btn ${starred ? "on" : ""}"
        data-station-name="${s.name.replace(/"/g, "&quot;")}"
      >${starred ? "★ Remove from shortlist" : "☆ Add to shortlist"}</button>
    </div>
  `;
};

// ── List view ────────────────────────────────────────
const sortedStations = (stations) => {
  return [...stations].sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name);
    const valA = a[sortKey] ?? Infinity;
    const valB = b[sortKey] ?? Infinity;
    return valA - valB;
  });
};

const renderListInto = (containerId, stations) => {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (stations.length === 0) {
    el.innerHTML = `<p class="data-note" style="text-align:center;padding:12px 0">No stations match.</p>`;
    return;
  }
  el.innerHTML = sortedStations(stations).map((s) => {
    const starred = shortlist.has(s.name);
    return `
      <div class="station-row ${starred ? "starred" : ""}" data-name="${s.name.replace(/"/g, "&quot;")}">
        <span class="row-star ${starred ? "on" : ""}" data-star-name="${s.name.replace(/"/g, "&quot;")}" title="Shortlist">★</span>
        <span class="row-name">${s.name}</span>
        <div class="row-stats">
          <div class="row-stat">
            <span class="row-stat-label">Hors</span>
            <span class="row-stat-value">${s.horsham ?? "–"}</span>
          </div>
          <div class="row-stat">
            <span class="row-stat-label">Hert</span>
            <span class="row-stat-value">${s.hertford ?? "–"}</span>
          </div>
          <div class="row-stat">
            <span class="row-stat-label">Lon</span>
            <span class="row-stat-value">${s.train ?? "–"}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Attach listeners after DOM insertion (no inline onclick — iOS safe)
  el.querySelectorAll(".row-star").forEach((star) => {
    const handler = (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleStar(star.dataset.starName);
    };
    star.addEventListener("click", handler);
    star.addEventListener("touchend", handler);
  });

  el.querySelectorAll(".station-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".row-star")) return;
      const name = row.dataset.name;
      const station = stationData.find((s) => s.name === name);
      if (!station) return;
      map.setView([station.lat, station.lon], 13, { animate: true });
      const marker = markerMap.get(name);
      if (marker) marker.openPopup();
    });
  });
};

const renderList = () => {
  // list shows same filtered set as the map
  const filtered = currentFiltered();
  renderListInto("station-list", filtered);
  renderListInto("mob-station-list", filtered);
};

// ── Core filter logic ────────────────────────────────
const currentFiltered = () => {
  if (shortlistOnly) {
    return stationData.filter((s) => shortlist.has(s.name));
  }
  const minHorsham = getVal("deskHorshamMin"), maxHorsham = getVal("deskHorshamMax");
  const minHertford = getVal("deskHertfordMin"), maxHertford = getVal("deskHertfordMax");
  const minTrain = getVal("deskTrainMin"), maxTrain = getVal("deskTrainMax");
  return stationData.filter((s) => {
    if (s.horsham !== null && (s.horsham < minHorsham || s.horsham > maxHorsham)) return false;
    if (s.hertford !== null && (s.hertford < minHertford || s.hertford > maxHertford)) return false;
    if (s.train !== null && (s.train < minTrain || s.train > maxTrain)) return false;
    return true;
  });
};

// ── Main render ──────────────────────────────────────
const renderStations = () => {
  // Update slider labels and fills
  [["Horsham", "deskHorsham", "mobHorsham"],
   ["Hertford", "deskHertford", "mobHertford"],
   ["Train", "deskTrain", "mobTrain"]].forEach(([key, desk, mob]) => {
    const min = getVal(desk + "Min"), max = getVal(desk + "Max");
    setDisplay("desk" + key + "Value", min, max);
    setDisplay("mob" + key + "Value", min, max);
    updateFill(desk + "Wrap");
    updateFill(mob + "Wrap");
  });

  markersLayer.clearLayers();
  markerMap.clear();

  const filtered = currentFiltered();

  filtered.forEach((s) => {
    const starred = shortlist.has(s.name);
    let marker;

    if (starred) {
      marker = L.marker([s.lat, s.lon], {
        icon: makeIcon(true),
        zIndexOffset: 1000,
      });
    } else {
      marker = L.circleMarker([s.lat, s.lon], {
        radius: 7,
        color: "#2f5d62",
        fillColor: "#6ea6a1",
        fillOpacity: 0.88,
        weight: 1.5,
      });
    }

    marker.bindPopup(buildPopup(s), { maxWidth: 260 });
    marker.addTo(markersLayer);
    markerMap.set(s.name, marker);
  });

  updateBadges(filtered.length, stationData.length);
  renderList();
};

// ── CSV load ─────────────────────────────────────────
const columnCandidates = {
  lat: ["Latitude", "Lat", "lat"],
  lon: ["Longitude", "Lon", "Lng", "lon", "lng"],
  horsham: ["Drive_Time_Horsham_Minutes"],
  hertford: ["Drive_Time_Hertford_Minutes"],
  train: ["Min_Train_Time_Minutes"],
  name: ["Station"],
  line: ["Line"],
  county: ["County"],
  terminus: ["London_Terminus"],
};

const findColumn = (row, options) => options.find((key) => key in row);
const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeRow = (row) => {
  const latKey = findColumn(row, columnCandidates.lat);
  const lonKey = findColumn(row, columnCandidates.lon);
  if (!latKey || !lonKey) return null;
  const lat = parseNumber(row[latKey]);
  const lon = parseNumber(row[lonKey]);
  if (lat === null || lon === null) return null;
  return {
    name: row[findColumn(row, columnCandidates.name)] || "Unknown",
    line: row[findColumn(row, columnCandidates.line)] || "",
    county: row[findColumn(row, columnCandidates.county)] || "",
    terminus: row[findColumn(row, columnCandidates.terminus)] || "",
    lat,
    lon,
    horsham: parseNumber(row[findColumn(row, columnCandidates.horsham)]),
    hertford: parseNumber(row[findColumn(row, columnCandidates.hertford)]),
    train: parseNumber(row[findColumn(row, columnCandidates.train)]),
  };
};

Papa.parse(CSV_PATH, {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: (results) => {
    if (results.errors?.length) { updateBadges("Err", "–"); return; }
    stationData = results.data.map(normalizeRow).filter(Boolean);
    if (!stationData.length) { updateBadges(0, 0); return; }
    const bounds = L.latLngBounds(stationData.map((s) => [s.lat, s.lon]));
    map.fitBounds(bounds.pad(0.12));
    renderStations();
  },
  error: () => updateBadges("–", "–"),
});
