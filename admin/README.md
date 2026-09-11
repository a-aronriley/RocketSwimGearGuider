# Admin Guide — Updating Gear Data

The gear data lives in `data/gear-data.json`. This file controls everything the Gear Guider displays.

## How to Edit

1. Go to [gear-data.json on GitHub](https://github.com/aaronrileysalesforce/RocketSwimGearGuider/blob/main/data/gear-data.json)
2. Click the pencil icon (✏️) to edit
3. Make your changes
4. Click "Commit changes"
5. The site updates automatically within a few minutes

## Structure

### Levels
Each level has: `id`, `name`, `ageRange`, `competitive`, `coachRatio`

### Gear Items
Each item has:
- `id` — unique identifier (don't change existing ones)
- `name` — display name
- `category` — `"WATER"` or `"DRYLAND"`
- `levels` — object mapping each level ID to `"R"` (required), `"O"` (optional), or `""` (not needed)
- `priceFromClub` — price in dollars if sold by club, or `null`
- `purchaseUrl` — link to buy, or `null`
- `source` — one of: `"store"`, `"club"`, `"coach"`, `"amazon"`, `"any"`
- `storeName` — display name for store (e.g., "Splashables")
- `notes` — any extra info

### Adding a New Gear Item

Copy an existing item and modify:

```json
{
  "id": "new-item-id",
  "name": "New Item Name",
  "category": "WATER",
  "levels": { "J3": "", "J2": "", "J1": "R", "S3": "R", "S2": "R", "S1": "R", "CMS": "R", "MS": "R", "MSIC": "R", "Masters": "" },
  "priceFromClub": null,
  "purchaseUrl": "https://example.com/product",
  "source": "store",
  "storeName": "StoreName",
  "notes": ""
}
```

### Changing Prices

Find the item by `id` and update `priceFromClub`.

### Changing Level Requirements

Find the item and update its `levels` object. Use:
- `"R"` = Required
- `"O"` = Optional
- `""` = Not needed at this level
