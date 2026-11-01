# Coding Area — Multi-Coding-Agent Terminal Platform

An Electron + React multi-agent terminal workspace inspired by **[wavetermdev/waveterm](https://github.com/wavetermdev/waveterm)** and **[warpdotdev/warp](https://github.com/warpdotdev/warp)**, built to run and orchestrate multiple coding agents (**Codex CLI**, **Claude Code**, and **AGY**) simultaneously.

## Architecture & Open-Source Building Blocks

Instead of reinventing terminal emulators, state serializers, or split-pane layout engines, this project integrates the proven open-source stack used by WaveTerm and VS Code:

- **Terminal Core & Addons (`@xterm/xterm` + `TermWrap`)**:
  - `@xterm/addon-webgl`: GPU-accelerated WebGL terminal rendering with automatic fallback.
  - `@xterm/addon-unicode11`: Full double-byte CJK (Chinese / Japanese / Korean) character width and emoji support.
  - `@xterm/addon-serialize`: Official terminal buffer & ANSI color state serializer/restorer across restarts.
  - `@xterm/addon-clipboard`: OSC 52 clipboard integration for TUI coding agents.
  - `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links`.
- **Native Pseudo-Terminal (`node-pty`)**:
  - Windows ConPTY / Unix PTY with `xterm-256color`, `COLORTERM=truecolor`, and automatic UTF-8 (`chcp 65001`) initialization so full-screen agent TUIs (`codex`, `claude`, `agy`) and Chinese IME input work out of the box.
- **OSC Protocol & Agent Status Detection (`TermWrap` + `AgentOutputMonitor`)**:
  - Supports **OSC 7** (live working directory tracking), **OSC 9 / OSC 777** (desktop notification escape sequences), **OSC 133** (Warp/Wave/FinalTerm semantic prompt & command completion markers), **BEL (`\x07`)**, and TUI prompt heuristics.
  - Automatically detects and notifies when an agent **finishes a task**, **waits for user input**, or **asks for tool/command permission** (with 1-click Approve/Deny actions).
- **Resizable Multi-Pane Grid (`allotment`) & Reactive State (`jotai` + `electron-store`)**:
  - Switch between Single Tab, 2-Pane Split, 3-Pane Split, and 2x2 4-Agent Grid with draggable split sashes.
  - Persists workspace layout, sessions, working directories, and serialized terminal scrollback (`@xterm/addon-serialize`) via `electron-store`, and re-spawns fresh agent CLI processes on restart.

## Quick Start

```bash
# Start in development mode with hot-reload
npm run dev

# Typecheck and build for production
npm run build

# Preview production build
npm run start
```
