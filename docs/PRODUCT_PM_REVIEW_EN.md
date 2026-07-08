# AISmartRun PM Review

Date: 2026-07-08 (post adversarial review-and-fix round)  
Version: 0.1.0  
Method: 8 parallel review lenses (first-use, HUD readability, coach safety, degradation, copy/store, docs consistency, engineering gates, data integrity) → every finding adversarially verified → all confirmed findings fixed with automated guards or explicitly documented as known limits → re-scored.  
Conclusion: Local engineering delivery is 96 / 100 and ready for Alpha device validation. It is still not a store-submission claim until real-device validation and AIUI Studio signing are complete.

## Score

Local engineering delivery: 96 / 100  
Real-device / store maturity: 88 / 100 until the Alpha device matrix is complete

| Dimension | Score | Notes |
|---|---:|---|
| User problem clarity | 9.5 | Glasses HUD has a clear value during runs and the MVP has stayed focused. |
| Product focus | 9.5 | Running HUD, optional heart rate and short AI coaching; non-goals stay explicit. |
| First-use flow | 9.5 | Home makes an honest readiness statement (no more connect-then-drop); one-tap run kept; double-press Backspace protects run data; first pairing is stated in store copy. |
| Wearable readability | 9.6 | Large single-green data; length-based font downshift prevents overflow for ≥1h / ≥10km values (tested); short footer source labels avoid squeeze. |
| Data integrity | 9.5 | Auto-pause on hide keeps time and distance consistent; stationary pace shows placeholder; stale heart rate falls back within 8s; live snapshot has a 10s TTL. IMU accuracy remains an Alpha calibration item. |
| AI coach value & safety | 9.6 | Z5 gets a deterministic rule answer plus a per-minute repeat cue; LLM streaming has a 10s timeout; output and injected memories are both sanitized; no fabricated numbers (page-level tests). |
| Engineering verifiability | 9.7 | 150/150 tests including 18 page-lifecycle tests driven through an `.ink` script loader; doctor scans real emoji codepoints and the green-only palette; `.aix` inspection asserts pages/version. |
| Risk control | 9.7 | BLE / IMU / ASR / LLM / TTS / network each degrade deterministically, mostly with executable tests; known limits (fixed maxHr 190, no walk/run stride tiers, Chinese-only UI) are in the PRD risk table and roadmap. |
| Delivery readiness | 9.6 | Store copy single-sourced and honest; version is 0.1.0 end to end; previews match the current copy; the Alpha matrix is executable with one unified exit gate. |

## Fixed in this round (all adversarially confirmed)

1. Heart-rate freeze after silent BLE drop → `gattserverdisconnected` + 8s staleness fallback (tested).
2. LLM stream hang → 10s hard timeout to rule fallback (tested).
3. Stale live snapshot treated as "now" → timestamped snapshot with 10s TTL (tested).
4. Screen-off corrupted data (time ran, distance froze) → auto-pause on hide / resume on show (tested).
5. Single-key Backspace destroying a run → double-press confirm within 3s (tested).
6. Home page connect-then-drop contradiction → home no longer connects; the run HUD owns the connection and retries on show.
7. Neighbor's HR strap silently saved as preferred → only the device page (or a matched remembered device) writes the preference (tested).
8. Z5 safety said once and possibly left to the LLM → per-minute repeat + deterministic rule answer at Z5 (tested).
9. Unvalidated LLM output → deterministic sanitizer (markdown/newlines/length) plus memory-injection sanitizing (tested).
10. 12s serial backend stall → 2.5s timeouts and a 60s login negative cache (tested).
11. Layout overflows (≥1h elapsed, ≥10km distance, 3-digit HR) → column re-budget + font tiers in `lib/hud.js` (tested).
12. Gate blind spots → real emoji scan, green-palette scan, all-5-pages check, `.aix` assertions, VERSION 0.1.0, internal docs excluded from the package.
13. Docs contradictions → one Alpha exit gate, executable P0 cases (plus new A-13), PROGRESS archived with a current-state header.

## Remaining Alpha Risks

| Risk | Impact | Required Validation |
|---|---|---|
| Bluetooth interactive gate | Auto connection may be limited by host interaction rules | Test remembered-device reconnect and device-page pairing on Rokid glasses. |
| IMU distance estimation | Pace/distance may differ from sports watches | Run walking, running and treadmill calibration cases (B-03). |
| AIUI speech chain | ASR/model/TTS may vary by firmware | Complete at least one full device turn (A-09/A-10). |
| Fixed maxHr 190 | Z5 warnings arrive late for older users | P1: age / custom max heart rate setting. |
| Official packaging | Local `.aix` is not final signed release | Package and upload through AIUI Studio. |

## Next Stage

Move into Alpha real-device validation. Exit gate: A-02, A-03, A-08, A-10, A-11 must pass and P0 ≥ 10/12. Do not expand features until the basic running, Bluetooth, AI coach and backend memory loops are proven on hardware.

Local release gate:

```bash
npm run verify:release
```
