# Sync API (migration 0002)

Two Postgres functions the phone calls over Supabase RPC. One call pushes
everything the phone has changed; one call pulls everything the server has.
Both run as the signed-in user, so row-level security still applies.

```ts
const { data, error } = await supabase.rpc('sync_push', { payload })
const { data, error } = await supabase.rpc('sync_pull', { since })
```

Not signed in returns error code `42501`.

## Rules that apply to both

- **The phone generates the ids.** Every row needs a UUID created on the
  device (`crypto.randomUUID()`). Pushing the same row twice is safe: the
  second push updates the first, it never creates a duplicate.
- **Newest edit wins.** `updated_at` is the phone's own clock, set when the
  user edits the row. An incoming row is only saved if its `updated_at` is
  newer than what the server already has.
- **`server_updated_at` is the server's clock.** You never send it. It is
  only used as the pull cursor.
- **Deletes are soft.** Set `deleted_at` instead of removing the row, so a
  delete made offline syncs like any other edit. `sync_pull` returns deleted
  rows so the phone can drop them locally.
- **`user_id` is ignored.** Whatever you send is replaced with the signed-in
  user. Don't bother sending it.
- **Send every field, every time.** A field left out of the JSON is saved as
  empty, not left alone. Always push the phone's full copy of the row.
- **Points are text:** `"SRID=4326;POINT(lon lat)"`, longitude first. For
  example `"SRID=4326;POINT(-80.126 43.351)"`. `sync_pull` returns the same
  format.

## sync_push

```jsonc
{
  "hunt_days":       [ /* ... */ ],
  "harvest_records": [ /* ... */ ],
  "observations":    [ /* ... */ ]
}
```

Any of the three keys may be left out. Hunt days are saved first, so a
harvest and its hunt day can go in the same call.

### hunt_days

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | required, made on the phone |
| `party_id` | uuid or null | must be a party you belong to |
| `wmu_code` | text or null | e.g. `"87D"` |
| `hunt_date` | date | required, `"2026-11-28"` |
| `species` | enum | required |
| `hours` | number or null | 0 to 24, one decimal |
| `updated_at` | timestamptz | required |
| `deleted_at` | timestamptz or null | |

### harvest_records

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | required |
| `hunt_day_id` | uuid or null | must be your own hunt day |
| `species` | enum | required |
| `sex` | `male` \| `female` | required |
| `age_class` | `adult` \| `yearling` \| `young` | required |
| `method` | `gun` \| `bow` \| `muzzleloader` | required |
| `harvested_at` | timestamptz | required |
| `location` | point text or null | |
| `wmu_code` | text or null | |
| `tag_number` | text or null | |
| `photo_path` | text or null | Storage path, not the image |
| `updated_at` | timestamptz | required |
| `deleted_at` | timestamptz or null | |

### observations

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | required |
| `hunt_day_id` | uuid | **required**, must be your own hunt day |
| `species` | text | free text here, not the enum |
| `sex`, `age_class` | text or null | free text |
| `count` | int | must be above 0, default 1 |
| `location` | point text or null | |
| `updated_at` | timestamptz | required |
| `deleted_at` | timestamptz or null | |

`species` is `deer`, `moose`, `bear`, `elk`, `wild_turkey` or `wolf_coyote`
wherever the table says enum.

### Response

```jsonc
{
  "applied": {
    "hunt_days":       ["..."],   // ids that were saved
    "harvest_records": ["..."],
    "observations":    []
  },
  "server_time": "2026-11-28T14:03:11.221Z"
}
```

**An id you sent that is missing from `applied` was rejected as stale**: the
server already had a newer edit. Don't retry it. Pull instead and merge, or
the user's older edit will keep bouncing.

Keep a row in the outbox until its id comes back in `applied` or a pull
shows a newer server copy.

## sync_pull

```ts
supabase.rpc('sync_pull', { since: lastCursor })   // null = full download
```

Returns every row of yours changed after `since`, deleted rows included.

```jsonc
{
  "hunt_days":       [ /* full rows */ ],
  "harvest_records": [ /* full rows */ ],
  "observations":    [ /* full rows */ ],
  "next_since":      "2026-11-28T14:02:41.000Z"
}
```

Store `next_since` and pass it as `since` next time. It is deliberately 30
seconds behind now, so a write landing mid-pull is never skipped. You will
sometimes see a row twice; merge by `id` and it doesn't matter.

Rows come back ordered by `server_updated_at`.

## Order of operations on the phone

1. Push the outbox.
2. Drop from the outbox anything listed in `applied`.
3. Pull with the stored cursor.
4. Write pulled rows into Dexie, deleting any with `deleted_at` set.
5. Save `next_since`.

Push before pull, so a row the user just edited isn't overwritten by an
older server copy in the same cycle.

## Errors

| Error | Meaning |
|---|---|
| `42501` | not signed in |
| row-level security violation | the row points at another user's hunt day, or a party you don't belong to |
| invalid input value for enum | `species`, `sex`, `age_class` or `method` is not one of the allowed values |
| null value ... violates not-null | a required field was left out of the JSON |

Questions: ask Karanveer.
