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

  /**
   * Parse a CSV string into gear objects.
   * @param {string} csvText
   * @returns {Array<Object>}
   */
  function parseCSV(csvText) {
    const lines = csvText.trim().split('\n').map(line => parseCSVLine(line));
    if (lines.length < 2) return [];

    const headers = lines[0].map(h => h.trim());
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
