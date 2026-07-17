# FilePilot

A private, local-first desktop file manager for organizing, searching, and understanding files without uploading their contents to a remote server.

FilePilot is built with Tauri, React, TypeScript, Rust, IndexedDB, and a modular clean architecture.

> FilePilot is currently in early development. The application shell, local persistence foundation, domain models, theme system, and shared UI primitives are implemented. Native indexing and file-management workflows are under active development.

## Core principles

- **Local-first:** File metadata and preferences remain on the user's device.
- **Privacy-focused:** File contents do not require cloud upload for organization or search.
- **Cross-platform:** The desktop application is powered by Tauri.
- **Modular architecture:** Domain logic is separated from UI and infrastructure.
- **Accessible interface:** Shared components support keyboard and assistive-technology usage.
- **Reliable development:** Formatting, linting, type checking, tests, and builds run through one verification command.

## Current features

- Responsive desktop application shell
- Collapsible navigation sidebar
- Overview, Library, Duplicates, Timeline, and Settings workspaces
- Light, dark, and system theme preferences
- Persisted local theme configuration
- Reusable accessible Button and IconButton components
- File-entry and library-source domain models
- Runtime validation with Zod
- IndexedDB persistence with Dexie
- Repository abstractions for storage independence
- Unit and IndexedDB integration tests
- Tauri desktop runtime

## Technology stack

| Area             | Technology                 |
| ---------------- | -------------------------- |
| Desktop runtime  | Tauri                      |
| Frontend         | React                      |
| Language         | TypeScript                 |
| Native layer     | Rust                       |
| Local database   | IndexedDB and Dexie        |
| State management | Zustand                    |
| Validation       | Zod                        |
| Icons            | Lucide React               |
| Testing          | Vitest and fake-indexeddb  |
| Tooling          | Vite, ESLint, and Prettier |

## Project architecture

```text
src/
├── app/
│   ├── components/
│   ├── layouts/
│   ├── navigation/
│   └── providers/
├── core/
│   ├── entities/
│   └── ports/
├── features/
├── infrastructure/
│   └── database/
├── shared/
│   ├── components/
│   ├── styles/
│   └── types/
└── test/
```

### Architecture responsibilities

- `app`: Global application composition, navigation, providers, and layouts
- `core`: Framework-independent domain entities and interfaces
- `features`: User-facing functionality grouped by business capability
- `infrastructure`: IndexedDB, Tauri, file-system, and platform integrations
- `shared`: Reusable components, styles, utilities, and types
- `test`: Shared test setup and data factories

## Getting started

### Requirements

Install the following tools before starting:

- A current LTS version of Node.js
- npm
- Rust stable
- The operating-system dependencies required by Tauri

### Install dependencies

```bash
npm install
```

### Run the web interface

```bash
npm run dev
```

### Run the desktop application

```bash
npm run tauri -- dev
```

### Create a production desktop build

```bash
npm run tauri -- build
```

## Quality checks

Run the complete verification pipeline:

```bash
npm run check
```

This command runs:

1. Prettier formatting validation
2. ESLint
3. TypeScript type checking
4. Vitest tests
5. Vite production build

Individual commands are also available:

```bash
npm run format
npm run format-check
npm run lint
npm run typecheck
npm run test
npm run test-watch
npm run build
```

## Local data model

FilePilot currently defines two primary domain entities.

### File entries

File and folder metadata includes:

- File name and path
- Extension and MIME type
- Category and entry kind
- Size and timestamps
- Availability state
- Security state
- Optional SHA-256 content hash

### Library sources

Connected storage locations include:

- Local folders
- Removable drives
- Platform and access information
- Synchronization mode
- Indexing statistics
- Availability state

These entities are validated with Zod before entering the persistence layer.

## Development workflow

Create feature branches from `main`:

```bash
git switch main
git pull
git switch -c feat/feature-name
```

Before committing changes:

```bash
npm run check
git diff --check
```

Use focused conventional commit messages:

```text
feat: add folder selection workflow
fix: prevent duplicate library sources
test: cover file indexing failure states
refactor: separate native file-system adapter
docs: update project architecture
```

## Roadmap

Planned development stages include:

- Native folder selection through Tauri
- Local recursive file indexing
- Indexed library source management
- Search and filtering
- File previews and metadata panels
- Duplicate detection using hashes
- Timeline-based file exploration
- Background indexing progress
- File-system change monitoring
- Local semantic search
- Privacy and indexing controls
- Cross-platform desktop releases

## Privacy

FilePilot is designed around local processing. Remote services should remain optional and must never receive private file contents without explicit user action.

The current project does not include telemetry, advertising, or cloud file storage.

## Repository

GitHub: https://github.com/kariaaw/filepilot
