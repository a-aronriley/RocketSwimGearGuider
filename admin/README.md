# Admin Guide — Updating Gear Data

The gear data lives in `data/gear-data.json`. This file controls everything the Gear Guider displays — levels, gear items, prices, stores, and payment info.

---

## How to Edit (via GitHub)

1. Go to [gear-data.json on GitHub](https://github.com/aaronrileysalesforce/RocketSwimGearGuider/blob/main/data/gear-data.json)
2. Click the **pencil icon** (✏️) to edit
3. Make your changes (see field reference below)
4. Scroll down and click **"Commit changes"**
5. The site updates automatically within a few minutes via GitHub Pages

> **Tip:** If you're not comfortable editing JSON directly, copy the file contents into [jsonlint.com](https://jsonlint.com) to validate before committing.

---

## File Structure Overview

```
gear-data.json
├── levels[]        — Swim levels (J3 → MSIC + Masters)
├── categories[]    — Gear categories: "WATER", "DRYLAND"
├── gear[]          — All 28 gear items with level requirements
├── stores[]        — Where to buy (Splashables, TeamAquatics, etc.)
└── payment{}       — Club email + coach contact info
```

---

## Field Reference

### Levels

Each level object:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique level code (do NOT change) | `"J3"`, `"S1"`, `"CMS"` |
| `name` | string | Full display name | `"Junior 3"`, `"Senior 1"` |
| `ageRange` | string | Typical age range | `"7-9"`, `"13-16"` |
| `competitive` | string/boolean | Competition level | `"Intro"`, `true`, `"Optional"` |
| `coachRatio` | string | Coach-to-swimmer ratio | `"10:1"`, `"25:1"` |

### Gear Items

Each gear object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique identifier (kebab-case). **Do NOT change existing IDs.** |
| `name` | string | ✅ | Display name shown to parents |
| `category` | string | ✅ | Either `"WATER"` or `"DRYLAND"` |
| `levels` | object | ✅ | Requirement per level (see below) |
| `priceFromClub` | number/null | ✅ | Price in dollars if sold by club, or `null` if not |
| `purchaseUrl` | string/null | ✅ | Full URL to buy online, or `null` |
| `source` | string | ✅ | Where to get it (see source values below) |
| `storeName` | string | — | Display name for store (e.g., `"Splashables"`) |
| `notes` | string | — | Extra info shown to parents |

#### Level Values

The `levels` object maps each level ID to a requirement code:

| Value | Meaning | Display |
|-------|---------|---------|
| `"R"` | **Required** at this level | Blue "Required" badge |
| `"O"` | **Optional** at this level | Yellow "Optional" badge |
| `""` | **Not needed** at this level | Item not shown |

Every gear item must include ALL 10 level keys: `J3`, `J2`, `J1`, `S3`, `S2`, `S1`, `CMS`, `MS`, `MSIC`, `Masters`

#### Source Values

| Source | Meaning | Payment Flow |
|--------|---------|--------------|
| `"club"` | Available from the club | If `priceFromClub` set → e-transfer email |
| `"coach"` | Available from coach | If `priceFromClub` set → e-transfer; if `null` → Discord DM |
| `"store"` | Buy from a swim store | External buy link (set `purchaseUrl` + `storeName`) |
| `"amazon"` | Buy from Amazon | External buy link (set `purchaseUrl`) |
| `"any"` | Available anywhere | Shown as "Available Anywhere" |

### Stores

Each store object:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Store display name |
| `location` | string | City or "Online" |
| `discount` | string/null | Discount info (e.g., `"20% club discount"`) or `null` |
| `url` | string | Store website URL |

### Payment

| Field | Type | Description |
|-------|------|-------------|
| `clubEmail` | string | E-transfer email for club gear payments |
| `coachContact` | string | How to reach coach for gear (Discord channel) |

---

## Common Tasks

### Adding a New Gear Item

Copy an existing item and modify. Make sure all 10 level keys are present:

```json
{
  "id": "new-item-id",
  "name": "New Item Name",
  "category": "WATER",
  "levels": {
    "J3": "", "J2": "", "J1": "R", "S3": "R", "S2": "R",
    "S1": "R", "CMS": "R", "MS": "R", "MSIC": "R", "Masters": ""
  },
  "priceFromClub": null,
  "purchaseUrl": "https://example.com/product",
  "source": "store",
  "storeName": "StoreName",
  "notes": ""
}
```

### Changing a Price

Find the item by its `id` and update `priceFromClub`:

```json
"priceFromClub": 25
```

Set to `null` if the item is no longer sold by the club.

### Changing Level Requirements

Find the item and update its `levels` object. Use `"R"`, `"O"`, or `""`:

```json
"levels": { "J3": "", "J2": "R", "J1": "R", "S3": "R", "S2": "R", "S1": "R", "CMS": "R", "MS": "R", "MSIC": "R", "Masters": "" }
```

### Updating a Buy Link

Find the item and change `purchaseUrl`:

```json
"purchaseUrl": "https://newstore.com/product-page"
```

### Adding a New Store

Add a new entry to the `stores` array:

```json
{
  "name": "New Store",
  "location": "City Name",
  "discount": null,
  "url": "https://newstore.com"
}
```

### Changing Payment Email

Update `payment.clubEmail`:

```json
"payment": {
  "clubEmail": "newemail@rocketswim.com",
  "coachContact": "DM in #gear channel on Discord"
}
```

---

## Google Sheets Integration (Optional)

The Gear Guider can optionally load data from a published Google Sheet instead of the JSON file. This is useful for non-technical admins who prefer spreadsheet editing.

### Setup

1. Create a Google Sheet with the gear data
2. Publish it: **File → Share → Publish to web** (choose CSV or JSON format)
3. Copy the published URL
4. In `gear-data.json`, add or update the `config` section:

```json
"config": {
  "dataSource": "sheets",
  "sheetsUrl": "https://docs.google.com/spreadsheets/d/e/YOUR_SHEET_ID/pub?output=csv"
}
```

5. Set `dataSource` to `"sheets"` to use Google Sheets, or `"json"` (default) to use the JSON file

### Fallback Behavior

If the Google Sheet is unavailable (network error, unpublished, etc.), the app automatically falls back to the local JSON file. No action needed.

---

## Data Validation

The app runs automatic validation checks when it loads. Open the **browser console** (F12 → Console tab) to see any warnings:

- ⚠️ Missing required fields (id, name, category, levels, source)
- ⚠️ Invalid level keys (must be one of the 10 valid level IDs)
- ⚠️ Store/amazon items missing `purchaseUrl`
- ⚠️ Club/coach items missing `priceFromClub` (warning only — coach items without price are valid)

These warnings help catch data entry mistakes before they affect parents.

---

## Current Gear IDs

For reference, here are all current gear item IDs (do not change these):

| ID | Name | Category |
|----|------|----------|
| `fins` | Fins | WATER |
| `club-swim-cap` | Club Swim Cap | WATER |
| `club-tshirt` | Club T-shirt | WATER |
| `club-mesh-bag` | Club Mesh Bag | WATER |
| `kickboard` | Kickboard | WATER |
| `pullbuoy` | Pullbuoy | WATER |
| `paddles-small-0` | Paddles small #0 | WATER |
| `paddles-medium-1` | Paddles medium #1 | WATER |
| `snorkel` | Snorkel | WATER |
| `parachute` | Parachute with 1.5m stretch cord | WATER |
| `stroller-hook` | Stroller hook | WATER |
| `ankle-band` | Ankle Band | WATER |
| `tennis-ball` | Tennis ball | WATER |
| `water-bottle` | Plastic Water Bottle | WATER |
| `plastic-cup` | Plastic cup (for backstroke) | WATER |
| `drag-suit` | Drag suit | WATER |
| `drag-suit-pockets` | Drag suit with pockets | WATER |
| `drag-socks` | Drag socks | WATER |
| `yoga-mat` | Yoga mat | DRYLAND |
| `stretch-cord` | Stretch cord with paddles (pullies) | DRYLAND |
| `resistance-band` | Resistance Band | DRYLAND |
| `skipping-rope` | Skipping Rope | DRYLAND |
| `massage-roller` | Massage Roller | DRYLAND |
| `club-parka` | Club Parka with Logo | DRYLAND |
| `club-tracksuit` | Club Tracksuit with Logo | DRYLAND |
| `club-hoodie` | Club Hoodie | DRYLAND |
| `club-winter-hat` | Club Winter Hat | DRYLAND |
| `club-bucket-hat` | Club Bucket Hat | DRYLAND |
