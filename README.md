# <div align="center"><img src="./serverpilot-studio/infratic.png" alt="Infratic logo" width="180" /><br/>Infratic</div>

<div align="center">
  Desktop infrastructure control for modern Linux operations.
</div>

<br />

Infratic is an Electron-powered desktop application for teams that want a fast, visual way to monitor and operate Linux servers over SSH. It brings server visibility, service discovery, health checks, deploy actions, logs, metrics, and an embedded terminal into a single command-center experience.

## Why This Project Exists

Managing servers often means hopping between SSH sessions, dashboards, logs, and deployment tools. Infratic reduces that context switching by giving operators a focused desktop workspace where infrastructure state, service controls, and response workflows live together.

## What You Get

- Centralized SSH-based server management from one desktop interface
- Service discovery for processes, ports, and runtime details
- Live CPU and memory tracking for active services
- Service control actions such as start, stop, and restart
- Health checks with status history and toggles
- Embedded terminal access from inside the application
- Deployment command management with execution history
- Grouped server organization and alerting workflows
- Framer Motion-powered branded startup experience

## Experience Highlights

- Designed as a desktop operations console rather than a generic CRUD tool
- Tailwind-based dark UI built for dense infrastructure workflows
- Electron + React architecture for responsive local-native behavior
- SQLite-backed local state and credential-aware desktop workflows

## Tech Stack

- Electron
- React
- TypeScript
- Vite / Electron Vite
- Tailwind CSS
- Zustand
- Framer Motion
- Better SQLite3
- SSH2
- Xterm.js
- uPlot

## Project Structure

```text
infratic/
├── README.md
├── .gitignore
└── serverpilot-studio/
    ├── src/
    ├── electron/
    ├── test/
    ├── package.json
    └── infratic.png
```

The main application lives in `serverpilot-studio/`.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+
- Linux, Windows, or another environment supported by Electron

### Install

```bash
cd serverpilot-studio
npm install
```

### Run In Development

```bash
npm run dev
```

### Type Check

```bash
npm run typecheck
```

### Run Tests

```bash
npm test
```

### Build

```bash
npm run build
```

### Package Desktop App

```bash
npm run package
```

## Core Workflows

### Server Management

Add servers, group them, connect over SSH, and keep connection state visible from the sidebar.

### Service Operations

Inspect discovered services, view process details, track resource usage, and control service lifecycle without leaving the app.

### Health Monitoring

Attach checks to services, review historical results, and quickly identify degraded systems.

### Deployment Commands

Save reusable deploy commands per server, run them on demand, and inspect command output in context.

### Logs And Terminal

Jump directly into service logs or open the embedded terminal when you need deeper intervention.

## Repository Notes

- Root folder: repository-level documentation and GitHub-facing metadata
- App folder: production code in `serverpilot-studio/`
- Generated output such as `dist/`, `dist-electron/`, `dist-builder/`, and `node_modules/` should stay untracked

## Publishing To GitHub

This project is now structured as its own git repository. To publish it on GitHub:

```bash
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

If this folder is being extracted from a larger workspace, create the GitHub repository first and then connect the remote URL in the commands above.
