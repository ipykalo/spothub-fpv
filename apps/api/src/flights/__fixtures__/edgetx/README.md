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
