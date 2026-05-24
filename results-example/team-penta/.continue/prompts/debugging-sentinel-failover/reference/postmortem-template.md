# Postmortem template — Sentinel incident

## Summary
One paragraph. What happened, customer impact, duration.

## Timeline (UTC)
- HH:MM — first +sdown event from sentinel-N
- HH:MM — +odown
- HH:MM — engineer paged
- HH:MM — quorum check run
- HH:MM — (if split-brain) writes paused
- HH:MM — (if split-brain) roles reconciled
- HH:MM — incident resolved

## Root cause
Network partition between AZs / replica disk pressure / quorum
misconfiguration / other.

## What worked
- Quorum check script returned the right answer immediately.
- ...

## What didn't
- ...

## Action items
- [ ] Network: investigate AZ-to-AZ link saturation in window X-Y
- [ ] Redis: review `down-after-milliseconds` setting
- [ ] Tooling: ...
