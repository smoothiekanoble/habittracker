# Widget Snapshot Contract

The widget **only** reads and (on tap) updates a small denormalized snapshot in App Group UserDefaults. No full habit model, no full history, no relational state.

## Storage

- **Suite**: App Group (e.g. `group.com.you.habittracker`)
- **Key**: `widgetPayload` (or equivalent)
- **Format**: JSON

## Exact shape

```json
{
  "habits": [
    {
      "id": "uuid-string",
      "title": "string",
      "isCompletedToday": true,
      "displayColor": "#6366f1",
      "displayIcon": "circle",
      "displayOrder": 0
    }
  ],
  "lastUpdated": "2025-01-15T12:00:00Z"
}
```

### Habit entry fields

| Field             | Type    | Description                    |
|-------------------|---------|--------------------------------|
| id                | string  | Habit UUID                     |
| title             | string  | Display title                  |
| isCompletedToday  | boolean | Completion state for today    |
| displayColor      | string  | Hex color for UI               |
| displayIcon       | string  | Icon name                      |
| displayOrder      | number  | Order in list (0-based)        |

### Root

| Field       | Type   | Description           |
|------------|--------|-----------------------|
| habits     | array  | Today’s habits only   |
| lastUpdated| string | ISO 8601 timestamp    |

## Not included

- Full Habit model (syncedAt, etc.)
- HabitLog table or full history
- 30-day history or any analytics
- User or auth data

## Who writes

- **Web app**: Does not write the widget snapshot; only the iOS app does.
- **iOS app** (when implemented): Builds snapshot from data fetched from Supabase (or from a local cache updated from Supabase), then writes to App Group. Calls `WidgetCenter.reloadAllTimelines()` after write.
- **Widget (Model A)**: On tap, reads snapshot, toggles `isCompletedToday` for the tapped habit, writes snapshot back, calls `WidgetCenter.shared.reloadTimelines(ofKind:)`.

## Who reads

- **Widget**: Timeline provider reads snapshot to render. No network, no SwiftData.

## Future iOS reconciliation

When the iOS app is implemented, on app activate:

1. Read snapshot from App Group.
2. For each habit in snapshot: if `isCompletedToday` is true, upsert `habit_log` for (habit_id, today) with completed true; else delete any `habit_log` for (habit_id, today).
3. Refetch habits and today's logs from Supabase.
4. Rebuild snapshot from that data.
5. Write snapshot to App Group.
6. Call `WidgetCenter.reloadAllTimelines()`.
