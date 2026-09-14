# Real EdgeTX logs

Drop `.csv` files straight from the radio's SD card (`LOGS/` folder) in here.
`edgetx-csv.parser.spec.ts` parses every file in this folder and checks that
each one reads cleanly and yields plausible flights.

They are the highest-value fixtures in the codebase: a column the radio names
differently, a receiver that reports voltage under another sensor, or a
firmware that writes the clock with a different precision all fail silently
without them. Keep a few from different receivers and EdgeTX versions.

Trim a long log before committing it if it is more than a few hundred kB —
the parser only needs enough rows to show a flight.

## What is here

- `Air65-2000-01-01-000103.csv` — an ExpressLRS Air65 whoop whose flight
  controller telemetry comes up after logging starts: a 56-field header, a
  12-row glitch at 46 fields, then 64. Trimmed after its first flight's
  disarm; the whole log was about 680 kB.
- `Air65-2000-01-01-002714.csv` — the same quad, whole. A 64-field header,
  with 179 of the flight's rows at 56 or 46 while the telemetry link is stale.

Both were logged by a radio with no clock set, hence 2000-01-01. Besides the
generic checks, the spec pins their figures one by one: a parser reading the
wrong columns once passed the generic checks on logs like these.
