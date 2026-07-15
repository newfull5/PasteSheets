# Paste Focus Timing (PS-30)

Cross-platform documentation of the paste sequence: how each app hands focus back
to the target application and when it injects the paste keystroke. **This document
describes current behavior — do not change any constant based on this doc alone**
(see "Why the values are not aligned yet").

Verified against code as of 2026-07-15 (branch `develop`).

## Sequence

### macOS

Entry point: `AppViewModel.pasteItem` → `PasteTextUseCase.execute`
(`apps/macos/PasteSheets/Presentation/ViewModels/AppViewModel.swift:215-225`,
`apps/macos/PasteSheets/Domain/UseCases/PasteTextUseCase.swift`)

```
pasteItem(item)
  │
  ├─ 1. hide panel              panel.orderOut(nil)
  │
  ├─ 2. wait 50 ms              pasteToggleDelay (fixed sleep)
  │
  └─ PasteTextUseCase.execute(text)
       ├─ 3. check Accessibility permission (abort + prompt if missing)
       ├─ 4. write clipboard         clipboardService.setText(text)
       ├─ 5. restore focus (poll)    restoreAndWaitUntilFrontmost(
       │                               timeout: 300 ms, pollInterval: 5 ms)
       ├─ 6. settle 40 ms            pasteKeyDelay (fixed sleep)
       └─ 7. inject Cmd+V            keySimService.simulatePaste()
```

### Windows

Entry point: `AppViewModel.PasteItem` → `PasteTextUseCase`
(`apps/windows/PasteSheet/Presentation/AppViewModel.cs:317-326`,
`apps/windows/PasteSheet/Domain/UseCases/PasteTextUseCase.cs`)

```
PasteItem(item)
  │
  ├─ PrepareAndRestoreFocus(text)        ← runs while OUR window is still foreground
  │    ├─ 1. write clipboard    clipboardService.SetText(text)
  │    └─ 2. restore focus      foregroundWindowService.RestorePreviousWindow()
  │
  ├─ 3. hide panel              Host?.HidePanelImmediate()
  │
  └─ SendPasteWhenReadyAsync()
       ├─ 4. wait for focus (poll)   IsPreviousWindowForeground(),
       │                             every 8 ms, up to 400 ms
       ├─ 5. settle 15 ms            PasteSettleDelayMs (fixed delay)
       └─ 6. inject Ctrl+V           keySimService.SimulatePaste()
```

## Timing values

| Step | macOS constant | macOS value | Windows constant | Windows value |
|------|---------------|-------------|------------------|---------------|
| Post-hide delay before use case | `Constants.pasteToggleDelay` (`App/Constants.swift:40`) | 50 ms | — (none; use case starts immediately) | 0 ms |
| Focus-restore poll timeout | `Constants.pasteFocusTimeout` (`App/Constants.swift:43`) | 300 ms | `maxWaitMs` (local const, `Domain/UseCases/PasteTextUseCase.cs:37`) | 400 ms |
| Focus-restore poll interval | `Constants.pasteFocusPollInterval` (`App/Constants.swift:44`) | 5 ms | `pollMs` (local const, `Domain/UseCases/PasteTextUseCase.cs:36`) | 8 ms |
| Settle before keystroke | `Constants.pasteKeyDelay` (`App/Constants.swift:48`) | 40 ms | `Constants.PasteSettleDelayMs` (`App/Constants.cs:15`) | 15 ms |

Both platforms poll adaptively for focus (fast machines paste sooner, slow machines
get up to the timeout), then apply a small fixed settle before injecting the keystroke.

## Why the step order is inverted on Windows

- **macOS**: hide first, then restore focus. The panel is a non-activating
  `NSPanel`, and `NSWorkspace`-based activation of the previous app works fine
  after our window is gone. Hiding first also removes the panel from the screen
  before the paste lands.
- **Windows**: restore focus first, then hide. Win32 foreground rules only allow
  a process to *give away* foreground while it currently owns it
  (`SetForegroundWindow` from a background process is blocked by the OS).
  If the window hid first, the app would lose foreground ownership and the
  focus handover to the target window would be denied. This is stated in the
  code comments at `AppViewModel.cs:319-321` and `PasteTextUseCase.cs:21-24`.

## Risk of the value differences

- **Settle 15 ms (Win) vs 40 ms (mac)**: the settle covers the gap between "target
  app owns foreground" and "target's key window/control is actually ready to
  receive a synthetic keystroke". The macOS value was raised to 40 ms specifically
  because shorter settles caused silently dropped pastes ("paste does nothing,
  retry works" — see comment at `Constants.swift:45-47`). Windows at 15 ms may
  show a higher paste-failure rate in slow-to-focus apps (heavy IDEs, Electron
  apps, remote-desktop sessions); the failure mode is silent, so it surfaces as
  intermittent "paste did nothing" reports rather than errors.
- **Poll timeout 300 ms (mac) vs 400 ms (Win)** and **interval 5 ms vs 8 ms**:
  lower practical risk. Timeout only matters when the target never regains focus
  within the cap (paste then fires anyway, possibly into the wrong window);
  the interval only affects paste latency granularity by a few ms.

## Why the values are not aligned (yet)

The constants are intentionally left as-is. Aligning them (e.g. raising the
Windows settle to 40 ms) without measurement would either add unnecessary latency
to every paste or mask a platform difference — WPF hide and Win32 foreground
transfer have different timing characteristics from AppKit's `orderOut` +
`NSWorkspace` activation, so the "right" settle per platform is an empirical
number, not a parity number.

**Plan**: measure paste success rate under the PS-11 repeated-paste QA scenario
(related test case: **T-PS-02**) on real hardware, per platform, and tune the
constants from that data. Until then, **do not change these constants.**
