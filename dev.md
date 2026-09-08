# Working on this extension

Contributor notes. Not published, and not the marketplace README.

## Setup

```sh
npm install
```

## The gates

Run all three before handing anything over. Green here is what CI checks too.

```sh
npm run typecheck   # tsc over src/, then over src/node/ and test/, the two with node's types
npm run build       # esbuild -> dist/browser.js and dist/node.js
npm test            # vitest, the pure modules and the build guards
```

`npm run test:watch` reruns while you work.

## Driving a real editor

```sh
npm run serve      # web on :3000, no browser launched, for the Playwright MCP server
npm run chrome     # web, launches its own Chromium
npm run desktop    # desktop VS Code, Node host
```

All three open `test/workspace/`, the bench. It is checked in and deliberately small, so a manual
check is repeatable rather than "make some files and see".

**Check both hosts.** They are two different environments: a Web Worker against a virtual filesystem
on one side, a Node host against real `file:` URIs on the other. `CLAUDE.md` lists the traps in each.

## Packaging

```sh
npx @vscode/vsce ls        # what would ship
npx @vscode/vsce package   # a .vsix, for installing by hand
```

A local package is not a release. Releases are built by CI from a clean checkout.

**The working notes ship on purpose.** `CLAUDE.md`, `dev.md` and the plan files are absent from
`.vscodeignore` by decision, so a local package carries whichever of them are on disk. Never add
them to it: `.vscodeignore` is committed, so a line naming them is a permanent public record of
files nobody was meant to go looking for.

## Version floor

`engines.vscode` is `^1.91.0`, which is what the micro:bit Web IDE pins. Its Node is far older than
the `@types/node` this compiles against, so a Node API newer than it compiles here and throws there.
Running against the floor is the only thing that catches it:

```sh
npm run desktop -- --vscode-version=1.91.1
```

The flag reaches the launcher through npm, and going via the script is what builds first: running
`config/desktop.mjs` by hand launches whatever `dist/` happens to hold.
