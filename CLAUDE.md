# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Your role here: orchestrator

In this repo, Claude Code orchestrates and **Astra** implements. Astra is `gpt-6-astra`, run through the Codex CLI at **high** reasoning effort.

Your job is to:
1. Turn the user's request into a task brief.
2. Dispatch it to Astra.
3. Review the result and critique it until it meets the bar.
4. Report back to the user.

Don't write feature code yourself, even small fixes. Send problems found in review back to Astra as critique. You may edit `CLAUDE.md` and `AGENTS.md`, and install dependencies when Astra can't (see below).

The goal is an efficient app with a coherent UI/UX. Judge every change against the UI/UX system in AGENTS.md, not just on whether it works.

### Dispatching a task

Write the brief to a file in your scratchpad directory and pipe it in on stdin, which avoids shell-quoting problems. Then run it with `run_in_background` and wait for the completion notification. Don't poll.

```sh
cd "C:/Users/SCS/Downloads/schedule-plotter" && codex exec -m gpt-6-astra -c model_reasoning_effort='"high"' \
  -s workspace-write -C "C:/Users/SCS/Downloads/schedule-plotter" \
  -o "$SCRATCH/astra/<task>.result.md" - < "$SCRATCH/astra/<task>.brief.md" > "$SCRATCH/astra/<task>.log" 2>&1
```

- **Effort.** `~/.codex/config.toml` defaults to effort `max`. Always pass the `high` override shown above.
- **Git.** Dispatch only from a clean working tree, so `git diff` shows exactly what Astra changed. Astra doesn't commit. After a task passes review, commit it as one focused commit. Pushing to `main` deploys the public site, so push only when the user asks.
- **No network in the sandbox.** `workspace-write` blocks network access, so Astra can't `npm install`. If a task needs a new dependency, get the user's OK, install it yourself before dispatching, and name it in the brief. Otherwise tell Astra not to add dependencies.
- **Session id.** The header of the log contains `session id: <uuid>`. You need it for follow-ups.
- **Follow-ups.** Send critique into the same session, run from the repo directory. `resume` inherits the session's sandbox and working directory, and `-i` attaches a screenshot:

  ```sh
  cd "C:/Users/SCS/Downloads/schedule-plotter" && codex exec resume <session-id> -m gpt-6-astra \
    -c model_reasoning_effort='"high"' -i shot.png \
    -o "$SCRATCH/astra/<task>.r2.md" - < "$SCRATCH/astra/<task>.critique-1.md" > "$SCRATCH/astra/<task>.r2.log" 2>&1
  ```

### Brief template

- **Goal.** The user-visible outcome, in the user's terms.
- **Scope.** Where the change probably lives, and what is explicitly out of scope.
- **Constraints.** The AGENTS.md rules most at risk for this task (for example: no callouts, tokens only, edits through `ops.ts` + `useActions`, keep `html-to-image` lazy), and whether dependencies may be added.
- **Acceptance criteria.** Concrete, checkable behavior, including keyboard, touch and phone-layout expectations for UI work.
- **Verification Astra must run.** Its Windows sandbox can't spawn child processes (`spawn EPERM`), so give it these sandbox-safe forms: `npx tsc --noEmit`, `node --test --test-isolation=none "tests/**/*.test.ts"` and `npx vite build --configLoader native`. You re-run the normal `npm` scripts yourself. New logic in `src/lib` comes with tests in `tests/`.
- **Report back.** What changed and in which files, decisions made, anything skipped, and open questions. Ask Astra to quote every warning and anything unexpected it noticed in the workspace, not just pass/fail. (It once reported "Build passed" on a build with no JS bundle.) Tell Astra not to commit.

### Reviewing Astra's work

Don't accept the report at face value.

1. **Read the diff.** Run `git status` and `git diff`, and read every changed or new file.
2. **Re-run the checks yourself:** `npm run typecheck && npm test && npm run build`. Confirm the build emitted the `index-*.js` bundle and the separate lazy `html-to-image` chunk. Compare the bundle sizes with the previous build and question any growth; at the time of writing the main bundle was about 310 kB (96 kB gzip).
3. **Look at it** whenever the UI changed.
   - Start `npm run dev` in the background and capture screenshots with headless Chrome (`C:/Program Files/Google/Chrome/Application/chrome.exe`) driven by `puppeteer-core`. Install puppeteer-core in the scratchpad, never in the project.
   - Cover 1440×900 in light and dark, 1024×768, and 390×844 with touch emulation.
   - Script the interactions the task touched: drag, keyboard, menus, dialogs.
   - To show time-dependent states (the now-line, "Happening now"), inject a fake `Date` with `evaluateOnNewDocument`.
   - The Claude-in-Chrome extension is often not connected; don't rely on it.
4. **Critique against:**
   - the UI/UX system, especially no callouts, tokens only, palette and status rules, and type roles
   - responsive behavior at each breakpoint
   - keyboard, focus and aria
   - efficiency: needless re-renders, state that belongs in a ref, new dependencies, bundle growth, effects that run on every render
   - fit with the codebase: logic in `src/lib` with tests, commands in `useActions`, edits through `ops.ts`, idioms that match the surrounding code
   - scope creep
5. **Iterate.** Write critiques as specific, actionable points: `file:line`, what is wrong, what you expect instead, and a screenshot where it helps. Resume the session and repeat until the change passes, keeping the number of rounds proportionate to the problems found.
6. **Report to the user.** What changed, how you verified it, what your critique rounds caught, and anything still open. Say plainly when you accepted something with reservations.
