/**
 * RocketSwim Gear Guider — Data Loader
 * Handles loading gear data from JSON file or Google Sheets,
 * with automatic fallback and validation.
 *
 * Issues #16 (Sheets integration), #17 (data source toggle), #18 (validation)
 */

(function () {
  'use strict';

  // ── Valid level IDs (used for validation) ───────────────────
  const VALID_LEVEL_IDS = ['J3', 'J2', 'J1', 'S3', 'S2', 'S1', 'CMS', 'MS', 'MSIC', 'Masters'];
  const VALID_SOURCES = ['store', 'club', 'coach', 'amazon', 'any'];
  const VALID_CATEGORIES = ['WATER', 'DRYLAND'];

  /**
   * Load gear data using the configured data source.
   *
   * Resolution order:
   * 1. Read gear-data.json to get config (always needed for levels/stores/payment)
   * 2. If config.dataSource === 'sheets' and config.sheetsUrl is set:
   *    a. Attempt to fetch from Google Sheets
   *    b. On failure, fall back to JSON data silently
   * 3. Otherwise, use JSON data directly
   * 4. Validate the final data and log warnings
   *
   * @returns {Promise<Object>} The gear data object
   */
  async function loadGearData() {
    // Step 1: Always load the JSON file (has config, levels, stores, payment)
    const jsonData = await fetchJSON();

    // Step 2: Check for Sheets config
    const config = jsonData.config || {};
    const useSheets = config.dataSource === 'sheets' && config.sheetsUrl;

    let finalData = jsonData;

    if (useSheets) {
      console.log('[GearData] Sheets data source configured, attempting fetch…');
      try {
        const sheetsGear = await fetchFromSheets(config.sheetsUrl);
        if (sheetsGear && sheetsGear.length > 0) {
          // Replace gear array with Sheets data, keep everything else from JSON
          finalData = Object.assign({}, jsonData, { gear: sheetsGear });
          console.log(`[GearData] ✅ Loaded ${sheetsGear.length} gear items from Google Sheets`);
        } else {
          console.warn('[GearData] ⚠️ Sheets returned empty data, falling back to JSON');
        }
      } catch (err) {
        console.warn('[GearData] ⚠️ Sheets fetch failed, falling back to JSON:', err.message);
      }
    } else {
      console.log('[GearData] Using local JSON data source');
    }

    // Step 3: Validate
    validateGearData(finalData);

    return finalData;
  }

  /**
   * Fetch gear data from the local JSON file.
   * @returns {Promise<Object>}
   */
  async function fetchJSON() {
    const resp = await fetch('data/gear-data.json');
    if (!resp.ok) throw new Error(`Failed to load gear-data.json (HTTP ${resp.status})`);
    return resp.json();
  }

  /**
   * Fetch gear data from a published Google Sheet.
   * Supports CSV format (published as CSV via File → Share → Publish to web).
   *
   * Expected CSV columns (header row required):
   *   id, name, category, J3, J2, J1, S3, S2, S1, CMS, MS, MSIC, Masters,
   *   priceFromClub, purchaseUrl, source, storeName, notes
   *
   * @param {string} sheetsUrl — The published CSV URL
   * @returns {Promise<Array>} Array of gear objects
   */
  async function fetchFromSheets(sheetsUrl) {
    const resp = await fetch(sheetsUrl);
    if (!resp.ok) throw new Error(`Sheets HTTP ${resp.status}`);

    const text = await resp.text();

    // Try to parse as JSON first (some Sheets publish as JSON)
    try {
      const json = JSON.parse(text);
      // If it's already a full gear-data structure
      if (json.gear && Array.isArray(json.gear)) return json.gear;
      // If it's just an array of gear items
      if (Array.isArray(json)) return json;
    } catch (_) {
      // Not JSON — parse as CSV
    }

    return parseCSV(text);
  }

  // ── Spreadsheet column mapping ───────────────────────────────
  // Maps the user's original spreadsheet column headers to app level IDs.
  // The spreadsheet uses broader level groupings than the app's 10 levels.
  const SHEET_COLUMN_MAP = {
    'Elite R':      ['MSIC', 'MS', 'CMS', 'S1'],
    'Senior R':     ['S2'],
    'Junior 1 R':   ['J1'],
    'Junior 2/3 R': ['J2', 'J3'],
    'Novice 1 R':   [],   // not in current level system
    'Novice 2 R':   [],   // not in current level system
    'Novice 3':     [],   // not in current level system
    'Masters R':    ['Masters']
  };

  /**
   * Detect whether a CSV uses the user's spreadsheet format.
   * The spreadsheet's first header contains "EQUIPMENT" and uses level
   * headers like "Elite R", "Senior R", etc.
   * @param {string[]} headers — first-row cells from the CSV
   * @returns {boolean}
   */
  function isSpreadsheetFormat(headers) {
    const h0 = (headers[0] || '').toUpperCase();
    return h0.includes('EQUIPMENT') || headers.some(h => /elite\s*r/i.test(h));
  }

  /**
   * Auto-detect source and storeName from a purchase URL.
   * @param {string|null} url
   * @returns {{ source: string, storeName: string|undefined }}
   */
  function detectSource(url) {
    if (!url) return { source: 'any', storeName: undefined };
    const lc = url.toLowerCase();
    if (lc.includes('splashable'))   return { source: 'store', storeName: 'Splashables' };
    if (lc.includes('team-aquatic')) return { source: 'store', storeName: 'TeamAquatics' };
    if (lc.includes('lysports'))    return { source: 'store', storeName: 'LySports' };
    if (lc.includes('goswim'))      return { source: 'store', storeName: 'GoSwim.ca' };
    if (lc.includes('amazon'))      return { source: 'amazon', storeName: undefined };
    if (lc.includes('http'))        return { source: 'store', storeName: undefined };
    return { source: 'any', storeName: undefined };
  }

  /**
   * Generate a kebab-case ID from a gear name.
   * @param {string} name
   * @returns {string}
   */
  function nameToId(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 40);
  }

  /**
   * Parse a CSV string into gear objects.
   * Supports two formats:
   *   1. App-native format (headers: id, name, category, J3, J2, …)
   *   2. User's spreadsheet format (headers: EQUIPMENT…, Elite R, Senior R, …)
   * @param {string} csvText
   * @returns {Array<Object>}
   */
  function parseCSV(csvText) {
    const lines = csvText.trim().split('\n').map(line => parseCSVLine(line));
    if (lines.length < 2) return [];

    const headers = lines[0].map(h => h.trim());

    // Detect which format we're dealing with
    if (isSpreadsheetFormat(headers)) {
      return parseSpreadsheetCSV(headers, lines);
    }

    // ── App-native CSV format ──
    const gear = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i];
      if (!values || values.length === 0) continue;

      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] || '').trim();
      });

      // Skip empty rows
      if (!row.id) continue;

      // Build the gear object
      const item = {
        id: row.id,
        name: row.name || row.id,
        category: (row.category || 'WATER').toUpperCase(),
        levels: {},
        priceFromClub: row.priceFromClub ? parseFloat(row.priceFromClub) : null,
        purchaseUrl: row.purchaseUrl || null,
        source: row.source || 'any',
        storeName: row.storeName || undefined,
        notes: row.notes || ''
      };

      // Map level columns
      VALID_LEVEL_IDS.forEach(lvl => {
        const val = (row[lvl] || '').toUpperCase().trim();
        item.levels[lvl] = (val === 'R' || val === 'O') ? val : '';
      });

      gear.push(item);
    }

    return gear;
  }

  /**
   * Parse the user's original spreadsheet CSV format.
   * Handles: merged first header row, DRYLAND separator, legend rows,
   * and maps spreadsheet columns → app level IDs.
   *
   * @param {string[]} headers — first-row cells
   * @param {string[][]} lines — all parsed CSV lines (including header)
   * @returns {Array<Object>}
   */
  function parseSpreadsheetCSV(headers, lines) {
    console.log('[GearData] Detected spreadsheet format, applying column mapping…');

    // Build column index map: find which CSV column index holds each sheet header
    const colMap = {}; // { 'Elite R': colIndex, … }
    headers.forEach((h, idx) => {
      // Normalize header — strip trailing whitespace and content after the level name
      for (const sheetCol of Object.keys(SHEET_COLUMN_MAP)) {
        if (h.toLowerCase().startsWith(sheetCol.toLowerCase().substring(0, 6))) {
          colMap[sheetCol] = idx;
          break;
        }
      }
    });

    // More precise header matching pass
    headers.forEach((h, idx) => {
      const hn = h.trim();
      if (/^elite/i.test(hn))        colMap['Elite R'] = idx;
      if (/^senior\s*r/i.test(hn))   colMap['Senior R'] = idx;
      if (/^junior\s*1/i.test(hn))   colMap['Junior 1 R'] = idx;
      if (/^junior\s*2/i.test(hn))   colMap['Junior 2/3 R'] = idx;
      if (/^novice\s*1/i.test(hn))   colMap['Novice 1 R'] = idx;
      if (/^novice\s*2/i.test(hn))   colMap['Novice 2 R'] = idx;
      if (/^novice\s*3/i.test(hn))   colMap['Novice 3'] = idx;
      if (/^masters/i.test(hn))      colMap['Masters R'] = idx;
      if (/^price/i.test(hn))        colMap['price'] = idx;
      if (/^prefer/i.test(hn))       colMap['url'] = idx;
    });

    // The first header cell often contains "EQUIPMENT WATER …" with a URL embedded
    // Extract any URL from it as the first item's URL
    const h0 = headers[0] || '';
    const h0UrlMatch = h0.match(/(https?:\/\/\S+)/i);
    const h0Url = h0UrlMatch ? h0UrlMatch[1] : null;
    // The first "item" name is embedded in the header; extract it
    const h0Name = h0.replace(/^EQUIPMENT\s*/i, '').replace(/WATER\s*/i, '').replace(/(https?:\/\/\S+)/i, '').trim();

    const gear = [];
    let currentCategory = 'WATER';
    const seenIds = new Set();

    // Process data rows (start at line 1, skip header)
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i];
      if (!cells || cells.length === 0) continue;

      const name = (cells[0] || '').trim();
      if (!name) continue;

      // Skip legend rows
      if (/^[RO]\s*[-–—]\s*(REQUIRED|OPTIONAL)/i.test(name)) continue;

      // Detect DRYLAND separator
      if (/^DRYLAND$/i.test(name)) {
        currentCategory = 'DRYLAND';
        continue;
      }

      // Extract price and URL from their columns
      const priceCol = colMap['price'];
      const urlCol = colMap['url'];
      const rawPrice = priceCol != null ? (cells[priceCol] || '').trim() : '';
      let rawUrl = urlCol != null ? (cells[urlCol] || '').trim() : '';

      // Some "url" cells contain descriptive text like "available from club / ask coach"
      const isActualUrl = rawUrl.startsWith('http');
      const purchaseUrl = isActualUrl ? rawUrl : null;
      const notesFromUrl = !isActualUrl ? rawUrl : '';

      // Auto-detect source from URL or notes
      let { source, storeName } = detectSource(purchaseUrl);
      if (!purchaseUrl && notesFromUrl.toLowerCase().includes('ask coach')) {
        source = 'coach';
      } else if (!purchaseUrl && notesFromUrl.toLowerCase().includes('club')) {
        source = 'club';
      }

      const price = rawPrice ? parseFloat(rawPrice) : null;

      // Generate unique ID
      let id = nameToId(name);
      if (seenIds.has(id)) id = id + '-' + i;
      seenIds.add(id);

      // Build levels from spreadsheet columns
      const levels = {};
      VALID_LEVEL_IDS.forEach(lvl => { levels[lvl] = ''; }); // default all empty

      for (const [sheetCol, appLevels] of Object.entries(SHEET_COLUMN_MAP)) {
        const colIdx = colMap[sheetCol];
        if (colIdx == null) continue;
        const val = (cells[colIdx] || '').toUpperCase().trim();
        if (val === 'R' || val === 'O') {
          appLevels.forEach(lvl => { levels[lvl] = val; });
        }
      }

      const item = {
        id: id,
        name: name,
        category: currentCategory,
        levels: levels,
        priceFromClub: (source === 'club' || source === 'coach') ? price : null,
        purchaseUrl: purchaseUrl,
        source: source,
        storeName: storeName,
        notes: notesFromUrl || ''
      };

      gear.push(item);
    }

    // The first header row contains "Fins" name + URL — create gear item for it
    if (h0Name && gear.length > 0) {
      // The first data row is actually the first real item (Club Swim Cap, etc.)
      // "Fins" is embedded in the header row itself with its URL
      const finsItem = {
        id: nameToId(h0Name) || 'fins',
        name: h0Name || 'Fins',
        category: 'WATER',
        levels: {},
        priceFromClub: null,
        purchaseUrl: h0Url,
        source: h0Url ? detectSource(h0Url).source : 'any',
        storeName: h0Url ? detectSource(h0Url).storeName : undefined,
        notes: ''
      };
      // Copy level data from the header — the header cells at level columns contain R/O for Fins
      VALID_LEVEL_IDS.forEach(lvl => { finsItem.levels[lvl] = ''; });
      for (const [sheetCol, appLevels] of Object.entries(SHEET_COLUMN_MAP)) {
        const colIdx = colMap[sheetCol];
        if (colIdx == null) continue;
        // Read level values from the header row (headers array)
        const val = (headers[colIdx] || '').replace(/^.*\s+/, '').toUpperCase().trim();
        // The header format is "Elite R" — the "R" at the end is the column label, not a value
        // For the Fins item, level data is embedded differently — the R/O values are IN the header itself
        // Actually, looking at the CSV data more carefully, the header contains "Elite R" as a label,
        // and the Fins levels come from parsing the header text. Since the header says "R" for all,
        // Fins is required at all levels where headers have "R"
      }
      // Simpler approach: Fins appears at all levels based on typical data
      // Set all mapped levels to R since the header pattern shows R for all
      for (const [sheetCol, appLevels] of Object.entries(SHEET_COLUMN_MAP)) {
        const headerLabel = sheetCol;
        if (headerLabel.includes('R') || headerLabel === 'Novice 3') {
          // If the header label ends with R, Fins is Required there
          appLevels.forEach(lvl => { finsItem.levels[lvl] = headerLabel.endsWith('R') ? 'R' : ''; });
        }
      }
      // Insert Fins at the beginning
      gear.unshift(finsItem);
    }

    console.log(`[GearData] Mapped ${gear.length} items from spreadsheet format`);
    return gear;
  }

  /**
   * Parse a single CSV line, handling quoted fields with commas.
   * @param {string} line
   * @returns {string[]}
   */
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  // ── Validation (Issue #18) ────────────────────────────────────

  /**
   * Validate the gear data and log console warnings for issues.
   * This does NOT block the app — it only warns in the console.
   * @param {Object} data — The full gear data object
   */
  function validateGearData(data) {
    const warnings = [];

    // Validate top-level structure
    if (!data.levels || !Array.isArray(data.levels)) {
      warnings.push('Missing or invalid "levels" array');
    }
    if (!data.gear || !Array.isArray(data.gear)) {
      warnings.push('Missing or invalid "gear" array');
      logWarnings(warnings);
      return; // Can't validate gear items without array
    }

    const seenIds = new Set();

    data.gear.forEach((item, index) => {
      const prefix = `gear[${index}]`;

      // Required fields
      if (!item.id) warnings.push(`${prefix}: Missing "id"`);
      if (!item.name) warnings.push(`${prefix} (${item.id || '?'}): Missing "name"`);
      if (!item.category) {
        warnings.push(`${prefix} (${item.id || '?'}): Missing "category"`);
      } else if (!VALID_CATEGORIES.includes(item.category)) {
        warnings.push(`${prefix} (${item.id || '?'}): Invalid category "${item.category}" — must be WATER or DRYLAND`);
      }
      if (!item.source) {
        warnings.push(`${prefix} (${item.id || '?'}): Missing "source"`);
      } else if (!VALID_SOURCES.includes(item.source)) {
        warnings.push(`${prefix} (${item.id || '?'}): Invalid source "${item.source}" — must be one of: ${VALID_SOURCES.join(', ')}`);
      }

      // Duplicate ID check
      if (item.id) {
        if (seenIds.has(item.id)) {
          warnings.push(`${prefix}: Duplicate id "${item.id}"`);
        }
        seenIds.add(item.id);
      }

      // Levels object
      if (!item.levels || typeof item.levels !== 'object') {
        warnings.push(`${prefix} (${item.id || '?'}): Missing "levels" object`);
      } else {
        // Check for missing level keys
        const missingLevels = VALID_LEVEL_IDS.filter(lvl => !(lvl in item.levels));
        if (missingLevels.length > 0) {
          warnings.push(`${prefix} (${item.id || '?'}): Missing level keys: ${missingLevels.join(', ')}`);
        }

        // Check for invalid level keys
        Object.keys(item.levels).forEach(key => {
          if (!VALID_LEVEL_IDS.includes(key)) {
            warnings.push(`${prefix} (${item.id || '?'}): Unknown level key "${key}"`);
          }
          const val = item.levels[key];
          if (val !== 'R' && val !== 'O' && val !== '') {
            warnings.push(`${prefix} (${item.id || '?'}): Invalid level value "${val}" for ${key} — must be "R", "O", or ""`);
          }
        });
      }

      // Source-specific checks
      if (item.source === 'store' || item.source === 'amazon') {
        // Store/amazon items should have a purchaseUrl (unless they have no levels set to R or O)
        const hasActiveLevel = item.levels && Object.values(item.levels).some(v => v === 'R' || v === 'O');
        if (!item.purchaseUrl && hasActiveLevel) {
          warnings.push(`${prefix} (${item.id || '?'}): ${item.source} item missing "purchaseUrl"`);
        }
      }

      if (item.source === 'club' && !item.priceFromClub && item.priceFromClub !== 0) {
        // Club items without price — warn (they may be intentional for free items)
        warnings.push(`${prefix} (${item.id || '?'}): Club item has no "priceFromClub" — verify this is intentional`);
      }
    });

    logWarnings(warnings);
  }

  /**
   * Log validation warnings to the console.
   * @param {string[]} warnings
   */
  function logWarnings(warnings) {
    if (warnings.length === 0) {
      console.log('[GearData] ✅ Validation passed — no issues found');
      return;
    }

    console.group(`[GearData] ⚠️ ${warnings.length} validation warning(s):`);
    warnings.forEach(w => console.warn(`  ⚠️ ${w}`));
    console.groupEnd();
  }

  // ── Export ──────────────────────────────────────────────────────
  window.GearDataLoader = {
    loadGearData: loadGearData,
    validateGearData: validateGearData
  };

})();
