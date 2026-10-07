# AGENTS.md

Project rules shared by every agent working in this repo. Claude Code loads this file through CLAUDE.md, and the Codex CLI reads it directly.

Schedule Plotter is a static web app (Vite + React 19 + TypeScript 7, no backend) for plotting a weekly class schedule each semester. It is deployed to GitHub Pages.

## Commands

```sh
npm run dev                 # dev server
npm test                    # unit tests: node:test runs the .ts files directly (Node 24 type stripping)
node --test --test-name-pattern="layoutDay" "tests/**/*.test.ts"   # a single test or suite
npm run typecheck           # tsc --noEmit
npm run build               # typecheck + vite build into dist/
```

There is no linter or formatter. Match the surrounding style: 2-space indent, single quotes, semicolons, trailing commas.

## Hard rules

- Relative imports use explicit `.ts`/`.tsx` extensions. That is what lets `node --test` run `src/lib` without a build step. Keep `src/lib` free of React and DOM imports, and free of non-erasable TypeScript (enums, namespaces, parameter properties). `erasableSyntaxOnly` enforces the last part.
- Every data change is a pure function in `src/state/ops.ts`, dispatched through `store.edit()` (active schedule) or `store.commit()` (workspace). This is what makes undo/redo work.
  - Pass a `coalesce` key for edits made per keystroke, so typing becomes a single undo step.
  - Use `navigate()` only for changes that should not be undoable, such as switching semesters.
- Anything read from localStorage, `schedule.json` or an imported file goes through `normalizeWorkspace` / `normalizeSchedule` in `src/lib/schedule.ts`. If the data shape changes, migrate it there. Old files must keep loading, including the v1 cell-map format handled by `src/lib/legacy.ts`. `tests/fixtures/v1-schedule.json` is a real v1 file kept as the reference for that format.
- `public/schedule.json` is the user's published data. Don't hand-edit it as part of feature work.
- Legacy conversion produces deterministic ids, and the published-vs-local comparison in `src/lib/storage.ts` depends on that. Keep them deterministic.
- User-facing commands (menus, shortcuts, panel buttons) live in `useActions()` in `src/state/actions.ts`. Destructive commands show a toast with Undo instead of a confirm dialog.

## Architecture

- **Data model** (`src/lib/types.ts`): a Workspace holds one Schedule per semester, and each Schedule holds Courses and Meetings.
  - A Meeting is a single weekday occurrence: `day` 1 = Monday … 7 = Sunday, and `start`/`end` in minutes after midnight.
  - A class meeting on several days is several Meetings. `describeMeetings` groups them back for display.
- **Store** (`src/state/store.tsx`): a reducer holding past/present/future workspaces.
  - It boots through `bootstrap()` in `src/lib/storage.ts`, which fetches the published `schedule.json`, reads the local copy, and decides which one wins.
  - It derives `sync` (clean / dirty / exported / local) and `conflict` (the published file changed under local edits). The header's publish pill shows both.
  - It saves to localStorage after a short debounce and again on `pagehide`.
- **UI state** (`src/state/ui.tsx`) holds:
  - The selection (a meeting or a course), which opens `EditorPanel`.
  - Hover linking, which highlights the same course or meeting across the sidebar, grid and editor.
  - Dialogs, the week/list view, toasts, the theme, and PNG export requests.
- **WeekGrid** (`src/components/WeekGrid.tsx`):
  - Hour height is fitted to the available space with a ResizeObserver.
  - Pointer gestures (create, move, resize; on touch, a long press starts a drag) run as a state machine in a ref. The live preview is `draft` state, and the change is committed on pointerup.
  - Overlapping meetings are laid out by `layoutDay` in `src/lib/layout.ts`.
  - The hover-slot preview is moved imperatively, without re-rendering.
- **Poster** (`src/components/Poster.tsx`) is a chrome-free rendering of the week.
  - PNG export captures it off-screen with `html-to-image`. Keep that import lazy so it stays a separate chunk.
  - Printing uses it too: `@media print` shows only `.poster-print`.
- **Keyboard shortcuts** live in `useShortcuts` in `src/App.tsx`. They are ignored while typing, and while a dialog, menu or quick-add popover is open.

## UI/UX system

- **Tokens.** Colors come from `src/styles/tokens.css` and are written with `light-dark()`. A subtree switches theme through `color-scheme`, set with a `data-theme` attribute; the root follows the OS unless the viewer picked a theme. Never hard-code colors in components.
- **Course colors.** Courses use an 8-slot categorical palette (`--cat-*`), checked for color-vision-deficiency separation in both themes.
  - `nextColor` assigns slots in a fixed order. Don't add, reorder or retune slots.
  - A course color only marks identity: dots, block tint, and the block's left edge. Text always uses the ink tokens (`--ink`, `--ink-2`, `--ink-3`), never the course color.
- **Status colors.** `--critical`, `--warning`, `--good` and `--now` are reserved for status and always appear with an icon or a text label.
- **No callout design.** The user considers it AI-looking. That rules out:
  - tinted notice boxes, alert or info banners, and boxed "danger zones"
  - colored left-border stripes on cards or rows
  - gradient-washed highlight cards

  Use plain sections instead (a heading, rows, hairline dividers), with a status dot or icon inline with the text. Put transient states into an existing control, the way the publish pill's popover handles a publish conflict. Selection highlights are neutral (`--surface-2`, `--hover`). The one exception is the class blocks in the week grid: they keep their tint and colored edge because they are the data.
- **Type.** Inter Variable is the UI font. Instrument Serif is only for display headings: the app title, dialog and editor titles, List-view day names, and the poster. Use `tabular-nums` for numbers that align (times, table columns), not for large stat values.
- **Lines.** Gridlines and dividers are solid hairlines (`--line`, `--line-soft`), never dashed.
- **Non-drag paths.** Every grid interaction also has a way to do it without dragging: the editor form, keyboard nudges on a selected block, and the List view, which is the grid's accessible table. Keep block `aria-label`s descriptive.
- **Breakpoints:**
  - ≥1280px: the editor docks as a third column.
  - <1280px: the editor overlays the grid.
  - <1100px: the sidebar becomes a drawer.
  - ≤720px (phone): a single-day grid with a day pager. The editor and quick add open as bottom sheets.
- **Motion.** Use the `--ease` / `--ease-spring` tokens with short durations. `prefers-reduced-motion` is handled globally in `app.css`.

## Publishing

1. Edits in the browser stay in localStorage.
2. **Export → schedule.json for the repo** downloads the file.
3. Replace `public/schedule.json` with it and push to `main`. `.github/workflows/deploy.yml` runs the tests, builds, and deploys to GitHub Pages.
