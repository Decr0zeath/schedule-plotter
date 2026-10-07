# Schedule Plotter

Plot a weekly class schedule each semester: drag classes onto a week grid, keep every semester in one place, and export the result as an image, a calendar file, or a printout.

Files from the original plotter (the v1 `schedule.json` cell-map format) can still be imported and are converted into a new semester.

## Features

- **Drag to plot.** Drag down a day to block out a class, drag a class to move it (hold <kbd>Alt</kbd> to copy), and drag its top or bottom edge to change the times. On a phone, long-press to drag, tap to edit, and swipe between days.
- **Quick add.** After dragging out a slot, type a course such as `(11055) Data Structures` or `CS 101 Intro`. The code and title are split out for you, and existing courses autocomplete.
- **Course editor.** Edit a course's code, title, color and notes, plus every meeting's day, times and room, in one panel.
- **Overlaps are flagged.** Clashing classes sit side by side, get a warning icon, and are listed in the sidebar.
- **Live sidebar.** Shows what's happening now or up next (with a countdown), weekly totals, a daily-load chart, and every course with its meeting pattern and hours.
- **Semesters.** Each term is its own schedule. Duplicate last semester to start the next one.
- **Exports.** PNG for sharing, `.ics` that repeats weekly between your term dates (Google Calendar, Apple Calendar, Outlook), a print layout, and `schedule.json` for the repo.
- **Comfort.** Undo/redo everything, keyboard shortcuts (press <kbd>?</kbd>), light and dark themes, a List view as an accessible table, and drag-and-drop JSON import.

## Publishing workflow

The deployed site shows `public/schedule.json`. Edits you make in the browser are saved locally and marked **Unpublished edits** until you publish them:

1. Edit in the browser.
2. **Export → schedule.json for the repo**.
3. Replace `public/schedule.json` with the downloaded file, then commit and push.

If `schedule.json` changes on the server while you have local edits (for example, you published from another device), the app asks whether to keep your edits or load the published version.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the scheduling logic (node:test)
npm run build      # type-check + production build into dist/
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. In the repo, set **Settings → Pages → Source** to **GitHub Actions**.

## Data format

`schedule.json` is a workspace with one or more schedules:

```jsonc
{
  "app": "schedule-plotter",
  "version": 2,
  "activeId": "sy-2025-2026-1st",
  "schedules": [
    {
      "id": "sy-2025-2026-1st",
      "title": "Undergraduate & Graduate Classes",
      "owner": "…",
      "term": "SY 2025–2026 · 1st Semester",
      "termStart": "", "termEnd": "",           // yyyy-mm-dd, for calendar export
      "settings": { "days": [1,2,3,4,5,6], "startHour": 7, "endHour": 19,
                    "fitToClasses": false, "snap": 30, "clock": "12h" },
      "courses":  [{ "id": "c-11055", "code": "11055", "title": "DATA STRUCT", "color": "blue", "notes": "" }],
      "meetings": [{ "id": "…", "courseId": "c-11055", "day": 1, "start": 570, "end": 720, "room": "I1004" }]
    }
  ]
}
```

`day` is the ISO weekday (1 = Monday). `start` and `end` are minutes after midnight. Files from the original plotter (`{"9:30-1": {"subject": …, "room": …}}`) are converted into a new semester when imported.

## Project layout

```
src/lib/         pure logic: time math, overlap layout, legacy conversion, .ics, stats, storage
src/state/       undoable store, UI state, shared actions
src/components/  week grid, quick add, editor, sidebar, list view, dialogs, poster (PNG/print)
src/styles/      design tokens (light/dark via light-dark()), layout and component styles
tests/           node:test unit tests
```

Course colors are an 8-slot palette, checked for color-vision-deficiency separation in both themes. New courses take the next slot in a fixed order. Every block also carries a text label, so color is never the only identifier.
