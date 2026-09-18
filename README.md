# BBC micro:bit Manager

Talk to a BBC micro:bit from VS Code. Connect to a board, flash a `.hex` file to
it, and open a serial terminal to see what it is printing.

Works in the browser and on the desktop, with no server and no setup.

## What it does

- **Flash a hex file.** Right-click any `.hex` in the Explorer and send it to a
  connected micro:bit. Useful on its own: somebody hands you a hex, you put it
  on a board.
- **Serial terminal.** Read what your program prints and type back to it.

## Programming a micro:bit

This extension puts a program **on** a micro:bit board, but it does not create
one. For that, install extensions like
[BBC micro:bit MicroPython](https://open-vsx.org/extension/carlosperate/bbcmicrobit-micropython),
for Python programs, and/or
[BBC micro:bit C++](https://open-vsx.org/extension/carlosperate/bbcmicrobit-cpp),
for C++ programmes.

The commands for these three extensions all appear in the micro:bit menu
triggered by clicking the `micro:bit` status bar item.

## Requirements

In a browser, putting a hex on a board needs WebUSB, so Chrome or Edge. The
serial terminal also works in Firefox, over Web Serial.

On the desktop the board is programmed via the `MICROBIT` USB drive it mounts.

## Licence

MIT.
