# GPX tracks

`gpx.parser.spec.ts` reads the files here; add real `.gpx` exports from a
phone, goggles or GPS logger beside them.

## What is here

- `air65-loop-utc.gpx` — **synthetic**. The GPS rows of
  `../edgetx/__fixtures__/Air65-2026-09-14-183210.csv` written out as a GPX
  track: 600 points with position, `GAlt` as `<ele>`, and track name `Air65`.
  Its times are **two hours earlier** than the radio log's (16:32:13Z against
  18:32:10), as a GPS logger in UTC would record a flight from a radio set to
  CEST. It is what tests a track finding its radio-log flight across a
  time-zone offset.
