# Release Notes

## v0.3.0 - 2026/09/24

- API 0.3.1: `commands.showMenu`, the status bar menu's command id, for a
  language extension's own "show all actions" button. Compatible with 0.3.0.
- Fix project description images not loading on vscode.dev.
- Fix a "no micro:bit found" warning on desktop when flashing with two boards
  plugged in and the choice between them is cancelled.

## v0.2.0 - 2026/09/18

- The micro:bit panel is now always this extension's own. The MicroPython and
  C++ extensions each have their own icon and panel, so the switch at the top
  of the panel is gone.
- The panel offers to install whichever language extension is missing.
- The status bar menu lists every installed language extension's commands.
- The panel can combine the micro:bit side panels into one and separate them
  again, and can hide itself; the status bar menu brings it back.
- API 0.3.0: `registerMenuGroup` replaces the mode registration, and can name
  the extension's sidebar for combining. A language extension now checks the
  API version itself.
- Improvements to build/test system

## v0.1.0 - 2026/09/17

- Initial release.
