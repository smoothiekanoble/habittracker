# Data Schema

Supabase is the canonical source of truth for habits and habit_logs. The web app is the primary client. Canonical domain types (TypeScript) live in the `shared/` package.

## Local (iOS) — SwiftData

### Habit

| Field      | Type   | Notes                          |
|-----------|--------|---------------------------------|
| id        | UUID   | Primary identifier              |
| title     | String | Habit name                      |
| color     | String | Hex or named (e.g. `#6366f1`)   |
| icon      | String | Icon name (e.g. `circle`)        |
| createdAt | Date   | Creation timestamp              |
| updatedAt | Date   | Last modification               |
| syncedAt  | Date?  | Optional; set when sync exists  |

### HabitLog

| Field     | Type   | Notes                    |
|----------|--------|--------------------------|
| id       | UUID   | Primary identifier       |
| habitId  | UUID   | FK to Habit.id           |
| date     | Date   | Day-only (no time)       |
| completed| Bool   | Default true              |
| createdAt| Date   | Creation timestamp       |

**Constraint:** Unique on `(habitId, date)` — one log per habit per day.

---

## Backend (Supabase Postgres)

### auth.users

Use Supabase Auth; `auth.uid()` for RLS. Optional: `public.profiles(id, email, created_at)` keyed by `auth.uid()`.

### habits

```sql
CREATE TABLE habits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  color         text NOT NULL DEFAULT '#6366f1',
  icon          text NOT NULL DEFAULT 'circle',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_habits_user_id ON habits(user_id);
CREATE INDEX idx_habits_user_created ON habits(user_id, created_at);
```

### habit_logs

```sql
CREATE TABLE habit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id      uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date          date NOT NULL,
  completed     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(habit_id, date)
);

CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, date);
CREATE INDEX idx_habit_logs_habit_date_desc ON habit_logs(habit_id, date DESC);
```

### Row Level Security (RLS)

- **habits**: `SELECT`, `INSERT`, `UPDATE`, `DELETE` where `user_id = auth.uid()`.
- **habit_logs**: `SELECT`, `INSERT`, `UPDATE`, `DELETE` where `habit_id` IN (SELECT id FROM habits WHERE user_id = auth.uid()).

Enable RLS on both tables; no service role in client.

---

## Computed vs stored

- **completedToday**: Computed from HabitLog where date == today. Cached in widget snapshot only.
- **Last 30 days**: Computed from HabitLog (query by habitId, date in range). Not a separate table.
- **Streaks**: Not in MVP.
