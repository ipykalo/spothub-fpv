# Real Betaflight blackbox logs

`.bbl` files from real quads, kept so the parser is tested on what flight
controllers actually write. The parser reads the CSV that Betaflight's own
`blackbox_decode` makes from them, so the spec reads that CSV, from
`decoded/`, and needs no native decoder to run.

## What is here

- `cinelog20/btfl_001.bbl` — GEPRC Cinelog 20 (TAKERG4AIO), Betaflight 4.5.0,
  4S. One log: a 14 s flight, the pack sagging from 15.9 V to 13.0 V under
  load.
- `air65/btfl_007.bbl` — BetaFPV Air65 (BETAFPVG473), Betaflight 4.5.0, 1S.
  Two logs 1.3 s apart — a re-arm — that join into one 37 s flight.

Neither flight controller had its clock set, so every log's start time reads
`0000-01-01`, which is why a blackbox import asks which day the logs were
flown.

Other logs dropped into `air65/` and `cinelog20/` stay local: `.gitignore`
keeps only these two, and always leaves out `padding.txt` and `btfl_all.bbl`,
which a flight controller's USB drive adds beside its logs — hundreds of MB of
zeros, and the whole flash repeating every log.

## decoded/

Each log's decoded CSV, cut to the four columns the parser reads (`time (s)`,
`rcCommand[3]`, `vbatLatest (V)`, `amperageLatest (A)`) and gzipped, one file
per log: `air65-btfl_007.01.csv.gz` is the first log in `air65/btfl_007.bbl`.

Decoded with `blackbox_decode --unit-frame-time s <file>` at blackbox-tools
commit `f832acf`, the one the API image pins. Re-decode them the same way if
that pin moves.
