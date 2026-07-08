# AISmartRun PRD

Date: 2026-07-08  
Version: 0.1.0  
Platform: Rokid Glasses / AIUI Ink

## 1. Product Summary

AISmartRun is a lightweight running assistant for Rokid glasses. The home page is the formal entry: glasses-only mode is ready by default, and the home page only reads settings and the remembered device to show a heart-rate readiness state — it does not establish any Bluetooth connection. A single action starts the run HUD, which performs the actual scan and connection after the run starts (remembered device first) and shows time, cadence, estimated distance and pace in large green data blocks. When real heart-rate data arrives, heart rate is added to the same panel.

During a run, the user can ask an AI coach about pace, heart rate, rhythm and safety. The AIUI app uses Rokid's official `LanguageModel` capability as the primary answer path. EverMind is connected through the backend for memory retrieval and answer record storage.

## 2. Target Users

- Rokid glasses users who run outdoors or on a treadmill.
- Runners who want glanceable metrics without checking a phone or watch.
- Users with a standard Bluetooth heart-rate strap or watch.
- Users who want short voice coaching during a run.

## 3. MVP Scope

| Area | Included |
|---|---|
| Home | Formal entry, glasses-ready state, heart-rate readiness state derived from settings and the remembered device (off / unavailable / remembered / not paired), start run, open device page. No Bluetooth connection on home. |
| Run HUD | Scan and connect heart rate after start (remembered device first), time, cadence, estimated distance, pace, optional heart rate, auto-pause on hide, double-press exit, large single-green visual style. |
| Bluetooth | Search, connect, remember and clear a standard heart-rate device. The device page is the only place the preferred device is written. |
| Settings | Stride length, automatic heart rate, voice cues, memory-assisted coaching. |
| AI Coach | Press/click/voice-triggered question flow, deterministic Z5 safety answer, official AIUI model answer with timeout and sanitization, TTS output, local fallback. |
| Backend | Anonymous device auth, EverMind memory context, AIUI answer record storage, APK-compatible `/coach/chat`. |

## 4. Out of Scope For Alpha

- Post-run history pages
- Maps and GPS tracks
- Structured training plans
- Leaderboards or social sharing
- Private vendor-specific watch protocols
- Full backend-driven AI answer flow for AIUI

## 5. Core Flow

1. User opens AISmartRun.
2. Home shows glasses-only mode as ready plus a heart-rate readiness state: automatic heart rate off shows "off", no Bluetooth capability shows "unavailable", a remembered device shows "remembered, connects on start", otherwise "not paired, pair on device page". Home does not scan or connect.
3. Voice wake-up on home is equivalent to starting a run; voice wake-up on the coach page starts a question.
4. User starts the run with tap, Enter, Space, Rokid `GlobalHook` or voice wake-up.
5. Run HUD starts immediately and works without any external device. After start, the HUD scans and connects heart rate, preferring the remembered device; a fallback first-found device is never written as the preferred device.
6. If heart-rate notifications are connected, heart rate appears in the same panel. On GATT disconnect or 8 seconds without new data, the HUD silently falls back to glasses-only mode.
7. When the HUD is hidden (screen off, page switch), recording auto-pauses; it auto-resumes on show, so duration and distance stay consistent. While the runner is stationary (cadence 0), pace shows `--:--` instead of a whole-run average.
8. Pressing Backspace once during a run shows "press again to finish"; only a second press within 3 seconds ends the run.
9. User can enter the coach page and ask a short question.
10. Coach reads the live snapshot (stale after 10 seconds), answers Z5 situations with deterministic safety rules without the LLM, otherwise asks AIUI `LanguageModel` with a 10-second streaming timeout and sanitized single-sentence output, retrieves backend memory best-effort (2.5-second timeout), speaks a short reply, and writes the turn back to the backend.

## 6. Physical Key Rules

| Page | Direction Keys | Enter / Space / GlobalHook | Backspace |
|---|---|---|---|
| Home | Switch focus between device and run | Activate focused action | Exit app |
| Bluetooth | Move between rows | Activate focused row | Stop cleanup and go back |
| Settings | Move between settings | Toggle/cycle focused setting | Go back |
| Run HUD | No in-card interaction | Reserved for host behavior | Double-press confirm: first press shows "press again to finish", second press within 3 seconds cleans up run resources and goes back |
| Coach | Not used | Start/stop listening | Cancel current turn, otherwise go back |

## 7. AI and EverMind Architecture

AIUI is the primary answer path:

- When the live snapshot shows heart-rate zone Z5, the coach answers with deterministic safety rules and skips the LLM entirely.
- `LanguageModel.availability()` checks host model availability.
- `LanguageModel.create()` uses host `defaultModel`, expected to be official DeepSeek configuration. The session system prompt contains only the coach persona; the live snapshot is injected per question turn.
- `promptStreaming().read()` is used for streaming text, with a 10-second total timeout; on timeout the rule-based fallback answers.
- LLM output is sanitized: markdown and line breaks removed, truncated to a single sentence.
- The live snapshot carries a timestamp and is treated as empty when older than 10 seconds, so the coach never presents stale data as "now".
- `wx.speech.playTTS(text)` is used for host TTS when available.

Backend is the memory and record layer:

- AIUI sends `app_id=AISmartRun` and stable anonymous `device_id`.
- Backend owns EverMind credentials, workspace routing and storage policy.
- Memory and login requests time out after 2.5 seconds; after a login failure, no retry happens within 60 seconds.
- Memory context and record write are best-effort and must not block the AIUI answer.
- APK sibling project remains compatible through `/api/coach-svc/coach/chat`.

## 8. Visual Rules

- Target AIUI wearable surface: 480px wide, 120-380px high.
- Black background, single green theme tokens, no emoji.
- Card-style pages with 2px borders and 12px radius.
- Run HUD is a passive display card and contains no in-card buttons.
- Heart rate is optional. Glasses-only mode is a valid primary mode, not an error state.
- The HUD source badge uses short labels: "HR + glasses", "glasses estimate", "timer only".
- Pace shows `--:--` while cadence is 0 instead of falling back to a whole-run average.

## 9. Alpha Acceptance

- Open app to running HUD within 3 seconds.
- Glasses-only run works without Bluetooth.
- At least one standard heart-rate device can be found, remembered on the device page and reconnected by the run HUD.
- Recording auto-pauses on hide and auto-resumes on show; duration does not grow while paused and no double ticking occurs.
- On heart-rate disconnect or 8 seconds without new data, the HUD falls back to glasses-only mode without interrupting the run.
- A single Backspace press during a run does not end the run; only a double press within 3 seconds exits.
- AI coach completes one full ASR -> AIUI model -> TTS turn on device; fallback still answers when offline.
- Backend memory failure does not block official AIUI model response.
- Local tests and local `.aix` packaging pass.

## 10. Risks and Known Limits

| Risk | Impact | Current strategy |
|---|---|---|
| BLE scan may require a user gesture | Automatic connection fails | Silently stay in glasses-only mode; verify on device |
| IMU distance estimation error | Pace and distance are approximate | Positioned as estimates; RSC/FTMS later |
| Background survival is uncertain | Frozen data or BLE drop when hidden | Auto-pause on hide, auto-resume on show; BLE notify behavior still needs device verification |
| maxHr fixed at 190 | Heart-rate zones inaccurate for older/younger users | Known limit; below 50% of maxHr no zone lights up; custom or age-based max heart rate is on the P1 roadmap |
| ASR / LLM / TTS host unavailability | Degraded coach experience | Text states plus rule-based local fallback |
| English labels too long | HUD crowding | Short labels: HR, Cad, Dist |
| Settings entry depth | Settings hard to discover | Settings are reached via the device page; observe discoverability in Alpha |
