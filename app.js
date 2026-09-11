/* ═══════════════════════════════════════════════════════════════
   RocketSwim Gear Guider v2 — Alpine.js application
   Single Alpine.data() closure. No globals. All state reactive.
   ═══════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "rocket-gear-guide-v2";

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function createSwimmer() {
  return {
    id: newId(),
    firstName: "",
    situation: "new",
    currentGroup: "",
    newGroup: "",
    ownedItemIds: [],
    optedOptionalIds: [],
    sizes: {},
    qty: {}
  };
}

function formatMoney(v) {
  if (v == null || Number.isNaN(v)) return "Price TBC";
  return `$${v.toFixed(2)}`;
}

/* ── Clipboard helpers ──────────────────────────────────────── */

function copyTextFallback(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  Object.assign(area.style, {
    position: "fixed", insetBlockStart: "0", insetInlineStart: "0",
    opacity: "0.01", width: "2px", height: "2px"
  });
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  document.body.removeChild(area);
  return ok;
}

async function copyText(text) {
  if (copyTextFallback(text)) return true;
  if (!navigator.clipboard || !window.isSecureContext) return false;
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

/* ── Toast ──────────────────────────────────────────────────── */

function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="toast-icon">✓</span> ${message}`;
  container.appendChild(el);
  setTimeout(() => { el.remove(); }, 3500);
}

/* ── CSV helpers (Google Sheets integration) ────────────────── */

const SHEET_COLUMN_MAP = {
  "Elite R":      ["MSIC", "MS", "CMS", "S1"],
  "Senior R":     ["S2"],
  "Junior 1 R":   ["J1"],
  "Junior 2/3 R": ["J2", "J3"],
  "Novice 1 R":   [],
  "Novice 2 R":   [],
  "Novice 3":     [],
  "Masters R":    ["Masters"]
};

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else current += ch;
  }
  result.push(current);
  return result;
}

function nameToId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").substring(0, 40);
}

function detectSource(url) {
  if (!url) return { source: null, storeName: undefined };
  const lc = url.toLowerCase();
  if (lc.includes("splashable"))   return { source: "store", storeName: "Splashables" };
  if (lc.includes("team-aquatic")) return { source: "store", storeName: "Team Aquatic Supplies" };
  if (lc.includes("goswim"))      return { source: "store", storeName: "GoSwim.ca" };
  if (lc.includes("amazon"))      return { source: "store", storeName: "Amazon Canada" };
  if (lc.includes("http"))        return { source: "store", storeName: undefined };
  return { source: null, storeName: undefined };
}

/* ═══════════════════════════════════════════════════════════════
   Alpine.data — the entire app lives here
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener("alpine:init", () => {
  Alpine.data("gearGuide", () => ({

    /* ── reactive state ──────────────────────────────────────── */
    data: null,
    error: "",
    loaded: false,
    step: 1,
    swimmers: [],
    activeSwimmerId: "",
    parentDiscord: "",
    paymentDate: todayISO(),
    carryOpen: {},
    copyNote: "",

    /* ── init ─────────────────────────────────────────────────── */
    async init() {
      try {
        /* 1. Always fetch local JSON (has config, groups, stores, payment) */
        const resp = await fetch("data/gear.json");
        if (!resp.ok) throw new Error("Could not load gear list");
        const json = await resp.json();

        /* 2. Optionally overlay items from Google Sheets */
        const cfg = json.config || {};
        if (cfg.dataSource === "sheets" && cfg.sheetsUrl) {
          try {
            const sheetsItems = await this._fetchSheets(cfg.sheetsUrl, json);
            if (sheetsItems && sheetsItems.length) {
              json.items = sheetsItems;
              console.log(`[GearGuide] Loaded ${sheetsItems.length} items from Sheets`);
            }
          } catch (e) {
            console.warn("[GearGuide] Sheets failed, using JSON:", e.message);
          }
        }

        this.data = json;
        this.restore();

        if (!this.swimmers.length) {
          const first = createSwimmer();
          this.swimmers = [first];
          this.activeSwimmerId = first.id;
        }

        this.loaded = true;
      } catch (err) {
        this.error = err.message || "Could not load gear list";
      }
    },

    /* ── Sheets CSV fetch ─────────────────────────────────────── */
    async _fetchSheets(url, jsonData) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Sheets HTTP ${resp.status}`);
      const text = await resp.text();

      /* Try JSON first */
      try {
        const parsed = JSON.parse(text);
        if (parsed.items && Array.isArray(parsed.items)) return parsed.items;
        if (Array.isArray(parsed)) return parsed;
      } catch { /* not JSON — parse as CSV */ }

      return this._parseCSV(text, jsonData);
    },

    _parseCSV(csvText, jsonData) {
      const lines = csvText.trim().split("\n").map(parseCSVLine);
      if (lines.length < 2) return [];
      const headers = lines[0].map(h => h.trim());

      /* Detect spreadsheet vs app-native format */
      const isSheet = (headers[0] || "").toUpperCase().includes("EQUIPMENT")
                   || headers.some(h => /elite\s*r/i.test(h));

      if (isSheet) return this._parseSpreadsheetCSV(headers, lines, jsonData);

      /* App-native CSV */
      const items = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i];
        if (!vals || !vals.length) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = (vals[idx] || "").trim(); });
        if (!row.id) continue;

        items.push({
          id: row.id,
          name: row.name || row.id,
          model: row.model || null,
          source: row.source || null,
          stores: row.stores ? row.stores.split("|") : [],
          priceCAD: row.priceCAD ? parseFloat(row.priceCAD) : null,
          sizes: [],
          sizingNote: row.sizingNote || null,
          groups: row.groups ? row.groups.split("|") : [],
          optionalGroups: row.optionalGroups ? row.optionalGroups.split("|") : [],
          replaces: row.replaces ? row.replaces.split("|") : [],
          neededBy: row.neededBy || "TBD",
          pickup: row.pickup || null,
          url: row.url || null,
          category: row.category || "water",
          notes: row.notes || ""
        });
      }
      return items;
    },

    _parseSpreadsheetCSV(headers, lines, jsonData) {
      /* Map header columns to level groups */
      const colMap = {};
      headers.forEach((h, idx) => {
        const hn = h.trim();
        if (/^elite/i.test(hn))        colMap["Elite R"] = idx;
        if (/^senior\s*r/i.test(hn))   colMap["Senior R"] = idx;
        if (/^junior\s*1/i.test(hn))   colMap["Junior 1 R"] = idx;
        if (/^junior\s*2/i.test(hn))   colMap["Junior 2/3 R"] = idx;
        if (/^novice\s*1/i.test(hn))   colMap["Novice 1 R"] = idx;
        if (/^novice\s*2/i.test(hn))   colMap["Novice 2 R"] = idx;
        if (/^novice\s*3/i.test(hn))   colMap["Novice 3"] = idx;
        if (/^masters/i.test(hn))      colMap["Masters R"] = idx;
        if (/^price/i.test(hn))        colMap.price = idx;
        if (/^prefer/i.test(hn))       colMap.url = idx;
      });

      /* Bucket mapping from SHEET_COLUMN_MAP levels → groups.equipmentBucket */
      const levelToBucket = {};
      (jsonData.groups || []).forEach(g => { levelToBucket[g.id] = g.equipmentBucket; });

      const items = [];
      let currentCategory = "water";
      const seenIds = new Set();

      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i];
        if (!cells || !cells.length) continue;
        const name = (cells[0] || "").trim();
        if (!name) continue;
        if (/^[RO]\s*[-–—]\s*(REQUIRED|OPTIONAL)/i.test(name)) continue;
        if (/^DRYLAND$/i.test(name)) { currentCategory = "dryland"; continue; }

        const rawPrice = colMap.price != null ? (cells[colMap.price] || "").trim() : "";
        let rawUrl = colMap.url != null ? (cells[colMap.url] || "").trim() : "";
        const isActualUrl = rawUrl.startsWith("http");
        const purchaseUrl = isActualUrl ? rawUrl : null;
        const notesFromUrl = !isActualUrl ? rawUrl : "";

        let source = null;
        const storeIds = [];
        if (purchaseUrl) {
          const det = detectSource(purchaseUrl);
          source = det.source;
        } else if (notesFromUrl.toLowerCase().includes("ask coach") || notesFromUrl.toLowerCase().includes("club")) {
          source = "coach";
        }

        let id = nameToId(name);
        if (seenIds.has(id)) id += "-" + i;
        seenIds.add(id);

        /* Map level columns → equipment bucket groups */
        const groups = new Set();
        const optionalGroups = new Set();
        for (const [sheetCol, appLevels] of Object.entries(SHEET_COLUMN_MAP)) {
          const colIdx = colMap[sheetCol];
          if (colIdx == null) continue;
          const val = (cells[colIdx] || "").toUpperCase().trim();
          if (val === "R") {
            appLevels.forEach(lvl => { if (levelToBucket[lvl]) groups.add(levelToBucket[lvl]); });
          } else if (val === "O") {
            appLevels.forEach(lvl => { if (levelToBucket[lvl]) optionalGroups.add(levelToBucket[lvl]); });
          }
        }

        items.push({
          id,
          name,
          model: null,
          source,
          stores: storeIds,
          priceCAD: rawPrice ? parseFloat(rawPrice) : null,
          sizes: [],
          sizingNote: null,
          groups: [...groups],
          optionalGroups: [...optionalGroups],
          replaces: [],
          neededBy: "TBD",
          pickup: source === "coach" ? "Ask coach at practice" : null,
          url: purchaseUrl,
          category: currentCategory,
          notes: notesFromUrl || ""
        });
      }

      return items;
    },

    /* ── Persistence ──────────────────────────────────────────── */
    persist() {
      const payload = {
        step: this.step,
        swimmers: this.swimmers,
        activeSwimmerId: this.activeSwimmerId,
        parentDiscord: this.parentDiscord,
        paymentDate: this.paymentDate,
        carryOpen: this.carryOpen
      };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
      catch { /* private mode / quota */ }
    },

    restore() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const s = JSON.parse(raw);
        this.step = s.step || 1;
        this.swimmers = Array.isArray(s.swimmers) && s.swimmers.length ? s.swimmers : [createSwimmer()];
        this.activeSwimmerId = s.activeSwimmerId || this.swimmers[0].id;
        this.parentDiscord = s.parentDiscord || "";
        this.paymentDate = s.paymentDate || todayISO();
        this.carryOpen = s.carryOpen || {};
      } catch {
        this.swimmers = [createSwimmer()];
      }
    },

    resetSession() {
      localStorage.removeItem(STORAGE_KEY);
      const first = createSwimmer();
      this.swimmers = [first];
      this.activeSwimmerId = first.id;
      this.step = 1;
      this.parentDiscord = "";
      this.paymentDate = todayISO();
      this.carryOpen = {};
      this.copyNote = "";
    },

    /* ── Computed getters ─────────────────────────────────────── */
    get lastUpdated() { return this.data?.lastUpdated || ""; },
    get payment()     { return this.data?.payment || {}; },
    get groups()      { return this.data?.groups || []; },
    get items()       { return this.data?.items || []; },
    get stores()      { return this.data?.stores || []; },

    get activeSwimmer() {
      return this.swimmers.find(s => s.id === this.activeSwimmerId) || this.swimmers[0];
    },

    get allSetupReady() {
      return this.swimmers.every(s => this.setupReady(s));
    },

    get footerTotals() {
      const rows = this.sessionNeedItems();
      return {
        count: rows.length,
        coach: this.sumCosts(rows, "coach"),
        store: this.sumCosts(rows, "store")
      };
    },

    get coachGrand() {
      return this.sumCosts(this.sessionNeedItems(), "coach");
    },

    /* ── Group / item / store lookups ─────────────────────────── */
    groupById(id) { return this.groups.find(g => g.id === id) || null; },
    groupName(id) { return this.groupById(id)?.name || id || ""; },
    bucketOf(groupId) { return this.groupById(groupId)?.equipmentBucket || ""; },
    itemById(id) { return this.items.find(i => i.id === id) || null; },
    storeById(id) { return this.stores.find(s => s.id === id) || null; },

    /* ── Swimmer helpers ──────────────────────────────────────── */
    swimmerLabel(swimmer, index) {
      const name = (swimmer.firstName || "").trim();
      return name || `Swimmer ${index + 1}`;
    },

    addSwimmer() {
      const next = createSwimmer();
      this.swimmers.push(next);
      this.activeSwimmerId = next.id;
      this.persist();
    },

    removeSwimmer(id) {
      if (this.swimmers.length < 2) return;
      this.swimmers = this.swimmers.filter(s => s.id !== id);
      if (this.activeSwimmerId === id) this.activeSwimmerId = this.swimmers[0].id;
      this.persist();
    },

    onSituationChange(swimmer) {
      if (swimmer.situation === "new") swimmer.currentGroup = "";
      if (swimmer.situation === "moving") {
        const opts = this.newGroupOptions(swimmer);
        if (swimmer.newGroup && !opts.some(g => g.id === swimmer.newGroup)) swimmer.newGroup = "";
      }
      this.persist();
    },

    newGroupOptions(swimmer) {
      if (swimmer.situation !== "moving" || !swimmer.currentGroup) return this.groups;
      const cur = this.groupById(swimmer.currentGroup);
      if (!cur) return this.groups;
      return this.groups.filter(g => g.pathway === cur.pathway && g.order > cur.order);
    },

    setupReady(swimmer) {
      if (!swimmer?.newGroup) return false;
      if (swimmer.situation === "moving") return Boolean(swimmer.currentGroup);
      return true;
    },

    goTo(step) {
      if (step >= 2 && !this.allSetupReady) return;
      this.step = step;
      window.scrollTo({ top: 0, behavior: "instant" });
      this.persist();
    },

    /* ── Item requirement helpers ──────────────────────────────── */
    isRequired(item, bucket) { return Boolean(bucket) && item.groups.includes(bucket); },
    isOptional(item, bucket) { return Boolean(bucket) && (item.optionalGroups || []).includes(bucket); },
    isCoach(item) { return item.source === "coach"; },
    isStoreLike(item) { return item.source !== "coach"; },

    replacedIdsForBucket(bucket) {
      const ids = new Set();
      this.items.forEach(item => {
        if (!this.isRequired(item, bucket)) return;
        (item.replaces || []).forEach(id => ids.add(id));
      });
      return ids;
    },

    /* ── Ownership / optional toggles ─────────────────────────── */
    qtyOf(swimmer, itemId) {
      const v = Number(swimmer.qty?.[itemId]);
      return v > 0 ? v : 1;
    },
    sizeOf(swimmer, itemId) { return (swimmer.sizes?.[itemId] || "").trim(); },
    owns(swimmer, itemId) { return swimmer.ownedItemIds.includes(itemId); },
    optedIn(swimmer, itemId) { return swimmer.optedOptionalIds.includes(itemId); },

    toggleOwned(swimmer, itemId) {
      const set = new Set(swimmer.ownedItemIds);
      set.has(itemId) ? set.delete(itemId) : set.add(itemId);
      swimmer.ownedItemIds = [...set];
      this.persist();
    },

    toggleOptional(swimmer, itemId) {
      const set = new Set(swimmer.optedOptionalIds);
      set.has(itemId) ? set.delete(itemId) : set.add(itemId);
      swimmer.optedOptionalIds = [...set];
      this.persist();
    },

    /* ── Status engine ────────────────────────────────────────── */
    rawStatus(swimmer, item) {
      const newBucket = this.bucketOf(swimmer.newGroup);
      const currentBucket = swimmer.situation === "moving" ? this.bucketOf(swimmer.currentGroup) : "";
      const requiredNew = this.isRequired(item, newBucket);
      const optionalNew = this.isOptional(item, newBucket);
      const requiredCurrent = this.isRequired(item, currentBucket);
      const replacedInNew = this.replacedIdsForBucket(newBucket);

      if (swimmer.situation === "new") {
        if (this.owns(swimmer, item.id)) return "have";
        if (requiredNew) return "need";
        if (optionalNew && this.optedIn(swimmer, item.id)) return "need";
        if (optionalNew) return "optional";
        return null;
      }

      /* moving */
      if (requiredCurrent && replacedInNew.has(item.id)) return "retire";
      if (requiredNew && requiredCurrent && !replacedInNew.has(item.id)) return "have";
      if (requiredNew && !requiredCurrent) return "need";
      if (optionalNew && this.optedIn(swimmer, item.id)) return "need";
      if (optionalNew) return "optional";
      return null;
    },

    /* ── Hand-me-down logic ───────────────────────────────────── */
    handDownMap() {
      const map = {};
      this.swimmers.forEach(giver => {
        this.items.forEach(item => {
          if (this.rawStatus(giver, item) !== "retire") return;
          const taker = this.swimmers.find(other => {
            if (other.id === giver.id) return false;
            return this.rawStatus(other, item) === "need";
          });
          if (taker) map[`${giver.id}:${item.id}`] = taker.id;
        });
      });
      return map;
    },

    receivedHandDown(swimmer, item) {
      return this.swimmers.some(giver => {
        if (giver.id === swimmer.id) return false;
        return this.handDownMap()[`${giver.id}:${item.id}`] === swimmer.id;
      });
    },

    handDownFromName(swimmer, item) {
      const giver = this.swimmers.find(other =>
        this.handDownMap()[`${other.id}:${item.id}`] === swimmer.id
      );
      if (!giver) return "";
      return this.swimmerLabel(giver, this.swimmers.indexOf(giver));
    },

    handDownToName(swimmer, item) {
      const takerId = this.handDownMap()[`${swimmer.id}:${item.id}`];
      if (!takerId) return "";
      const taker = this.swimmers.find(s => s.id === takerId);
      return taker ? this.swimmerLabel(taker, this.swimmers.indexOf(taker)) : "";
    },

    statusOf(swimmer, item) {
      if (this.receivedHandDown(swimmer, item) && this.rawStatus(swimmer, item) === "need") return "have";
      return this.rawStatus(swimmer, item);
    },

    /* ── Item filters ─────────────────────────────────────────── */
    listedItems(swimmer) {
      const newBucket = this.bucketOf(swimmer.newGroup);
      const currentBucket = swimmer.situation === "moving" ? this.bucketOf(swimmer.currentGroup) : "";
      const replaced = this.replacedIdsForBucket(newBucket);
      return this.items.filter(item => {
        if (this.isRequired(item, newBucket) || this.isOptional(item, newBucket)) return true;
        return Boolean(currentBucket) && this.isRequired(item, currentBucket) && replaced.has(item.id);
      });
    },

    itemsWithStatus(swimmer, status, sourceKind) {
      return this.listedItems(swimmer).filter(item => {
        if (this.statusOf(swimmer, item) !== status) return false;
        if (sourceKind === "coach") return this.isCoach(item);
        if (sourceKind === "store") return this.isStoreLike(item);
        return true;
      });
    },

    needItems(swimmer, sourceKind) { return this.itemsWithStatus(swimmer, "need", sourceKind); },
    haveItems(swimmer) { return this.itemsWithStatus(swimmer, "have"); },
    retireItems(swimmer) { return this.itemsWithStatus(swimmer, "retire"); },
    optionalItems(swimmer) { return this.itemsWithStatus(swimmer, "optional"); },

    sameBucketMove(swimmer) {
      if (swimmer.situation !== "moving") return false;
      return this.bucketOf(swimmer.currentGroup) === this.bucketOf(swimmer.newGroup);
    },

    hasAnyNeed(swimmer) {
      return this.needItems(swimmer).length > 0 || this.retireItems(swimmer).length > 0;
    },

    sessionNeedItems() {
      return this.swimmers.flatMap(swimmer =>
        this.needItems(swimmer).map(item => ({ swimmer, item }))
      );
    },

    /* ── Pricing ──────────────────────────────────────────────── */
    lineCost(swimmer, item) {
      if (item.priceCAD == null) return null;
      return item.priceCAD * this.qtyOf(swimmer, item);
    },

    sumCosts(rows, kind) {
      let total = 0, incomplete = false, count = 0;
      rows.forEach(({ swimmer, item }) => {
        if (kind === "coach" && !this.isCoach(item)) return;
        if (kind === "store" && !this.isStoreLike(item)) return;
        count += 1;
        const cost = this.lineCost(swimmer, item);
        if (cost == null) incomplete = true;
        else total += cost;
      });
      return { total, incomplete, count };
    },

    priceLabel(item) {
      return item.priceCAD == null ? "Price TBC" : formatMoney(item.priceCAD);
    },

    /* ── Review section helpers ────────────────────────────────── */
    swimmerCoachRows(swimmer) { return this.needItems(swimmer, "coach"); },

    swimmerCoachSubtotal(swimmer) {
      return this.sumCosts(
        this.swimmerCoachRows(swimmer).map(item => ({ swimmer, item })),
        "coach"
      );
    },

    memoFor(swimmer) {
      const name = (swimmer.firstName || "").trim() || "swimmer";
      const group = this.groupName(swimmer.newGroup) || "group";
      return (this.payment.memoFormat || "Gear - {name} - {group}")
        .replace("{name}", name)
        .replace("{group}", group);
    },

    lineLabel(swimmer, item) {
      const size = this.sizeOf(swimmer, item.id);
      const qty = this.qtyOf(swimmer, item.id);
      const sizeBit = size ? ` (${size})` : "";
      const price = item.priceCAD == null ? "Price TBC" : `$${item.priceCAD}`;
      return `${item.name}${sizeBit} x${qty}: ${price}`;
    },

    pickupNotes(swimmer) {
      return this.swimmerCoachRows(swimmer)
        .filter(item => item.pickup)
        .map(item => ({ name: item.name, pickup: item.pickup }));
    },

    retireNote(item) {
      const replacement = this.items.find(other => (other.replaces || []).includes(item.id));
      if (!replacement) return "No longer required in the new group.";
      return `Replaced by ${replacement.name}.`;
    },

    /* ── Store gear groups ────────────────────────────────────── */
    storeNeedGroups() {
      const map = new Map();
      this.sessionNeedItems().forEach(({ swimmer, item }) => {
        if (!this.isStoreLike(item)) return;
        const storeIds = item.stores?.length ? item.stores : ["tbc"];
        storeIds.forEach(storeId => {
          if (!map.has(storeId)) map.set(storeId, []);
          map.get(storeId).push({ swimmer, item });
        });
      });
      return [...map.entries()].map(([storeId, rows]) => {
        const store = this.storeById(storeId);
        return {
          id: storeId,
          name: store?.name || "Store TBC",
          location: store?.location || "",
          url: store?.url || "",
          discount: store?.discount || "",
          rows
        };
      });
    },

    shoppingListText() {
      return this.storeNeedGroups().map(group => {
        const head = [group.name, group.location, group.url].filter(Boolean).join(" — ");
        const lines = group.rows.map(({ swimmer, item }) => {
          const who = this.swimmerLabel(swimmer, this.swimmers.indexOf(swimmer));
          const model = item.model ? ` — ${item.model}` : "";
          const size = item.sizingNote && item.sizingNote !== "TBD" ? ` (${item.sizingNote})` : "";
          return `- ${item.name}${model}${size} [${who}]`;
        });
        return [head, ...lines].join("\n");
      }).join("\n\n");
    },

    /* ── Timeline ─────────────────────────────────────────────── */
    timelineGroups() {
      const map = new Map();
      this.sessionNeedItems().forEach(({ swimmer, item }) => {
        const key = item.neededBy || "TBD";
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ swimmer, item });
      });
      return [...map.entries()].map(([neededBy, rows]) => ({ neededBy, rows }));
    },

    timelineIcon(neededBy) {
      if (!neededBy || neededBy === "TBD") return "📋";
      const lc = neededBy.toLowerCase();
      if (lc.includes("day 1")) return "🏁";
      if (lc.includes("first week")) return "📅";
      if (lc.includes("first month")) return "🗓️";
      if (lc.includes("first meet") || lc.includes("meet")) return "🏊";
      if (lc.includes("when needed")) return "⏳";
      return "📋";
    },

    /* ── Discord message ──────────────────────────────────────── */
    discordMessage() {
      const lines = ["Gear order"];
      const handle = (this.parentDiscord || "").trim();
      lines.push(`Parent Discord: ${handle || "(not provided)"}`);
      lines.push("");

      this.swimmers.forEach((swimmer, index) => {
        const name = this.swimmerLabel(swimmer, index);
        if (swimmer.situation === "moving") {
          lines.push(`${name}: ${this.groupName(swimmer.currentGroup)} to ${this.groupName(swimmer.newGroup)}`);
        } else {
          lines.push(`${name}: New to Rocket, ${this.groupName(swimmer.newGroup)}`);
        }
        const rows = this.swimmerCoachRows(swimmer);
        if (!rows.length) lines.push("- No coach-supplied items to pay");
        rows.forEach(item => lines.push(`- ${this.lineLabel(swimmer, item)}`));
        const sub = this.swimmerCoachSubtotal(swimmer);
        const subText = sub.incomplete && sub.total === 0
          ? "Price TBC"
          : `$${sub.total.toFixed(2)}${sub.incomplete ? " (incomplete)" : ""}`;
        lines.push(`Subtotal: ${subText}`);
        lines.push("");
      });

      const grand = this.coachGrand;
      const totalText = grand.incomplete && grand.total === 0
        ? "Price TBC"
        : `$${grand.total.toFixed(2)}${grand.incomplete ? " (incomplete)" : ""}`;
      lines.push(`Total: ${totalText}`);
      lines.push(`Paid to ${this.payment.email || "payments@rocketswim.com"} on ${this.paymentDate || todayISO()}`);
      return lines.join("\n");
    },

    /* ── Splashables discount check ───────────────────────────── */
    isSplashables(item) {
      return (item.stores || []).includes("splashables");
    },

    /* ── Clipboard / print ────────────────────────────────────── */
    async copy(key, text) {
      const ok = await copyText(text);
      showToast(ok ? `${key} copied!` : "Copy blocked — long-press the text and choose Copy.");
    },

    printPage() { window.print(); }

  }));
});

/* ── Service worker registration ──────────────────────────────── */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
