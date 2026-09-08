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

This extension puts a program **on** a board. It does not write one. For that,
install the extension for the language you want and it will add its own tools to
the same micro:bit panel. Today that is
[BBC micro:bit MicroPython](https://open-vsx.org/extension/carlosperate/bbcmicrobit-micropython),
for Python programs.

With one installed, the panel is that extension's: its build button, its tools,
its layout. With more than one, a switcher appears at the top so you can move
between them.

You do not need to install this extension yourself. Installing either of the
above brings it along.

## Requirements

In a browser, putting a hex on a board needs WebUSB, so Chrome or Edge. The
serial terminal also works in Firefox, over Web Serial.

On the desktop there is nothing to allow: the board is reached through the
`MICROBIT` drive it mounts.

## Licence

MIT.
