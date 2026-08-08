#!/usr/bin/env node
/**
 * Apply scripts/roadmap.mjs to GitHub.
 *
 * Idempotent: run it as often as you like. Issues are matched by a hidden
 * marker in their body, not by title, so a retitled issue is still recognised
 * and updated rather than duplicated.
 *
 * It will never close or delete an issue. Closing is what a commit does
 * (`Closes #12`) or what a person does; a script with the power to close
 * issues eventually closes one that was open for a reason. The single
 * exception is seeding history: an issue declared `done: true` is created
 * closed, and is never reopened or re-closed afterwards.
 *
 *   npm run roadmap          # report what would change, touch nothing
 *   npm run roadmap:apply    # make it so
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { labels, phases } from "./roadmap.mjs";

const run = promisify(execFile);
const APPLY = process.argv.includes("--apply");

const marker = (id) => `<!-- roadmap:${id} -->`;

let created = 0;
let updated = 0;
let unchanged = 0;

function say(action, what) {
  const prefix = APPLY ? "" : "would ";
  console.log(`  ${prefix}${action.padEnd(9)} ${what}`);
}

async function gh(args, { json = true } = {}) {
  const { stdout } = await run("gh", args, { maxBuffer: 16 * 1024 * 1024 });
  return json ? JSON.parse(stdout || "null") : stdout;
}

/** `gh api` with a JSON body, without shelling through a string. */
async function api(method, path, body) {
  const args = ["api", "-X", method, path];
  for (const [key, value] of Object.entries(body ?? {})) {
    if (Array.isArray(value)) {
      // Repeated -f for arrays; gh has no array syntax.
      for (const item of value) args.push("-f", `${key}[]=${item}`);
    } else if (typeof value === "number") {
      args.push("-F", `${key}=${value}`);
    } else {
      args.push("-f", `${key}=${value}`);
    }
  }
  return gh(args);
}

async function ensureAuth() {
  try {
    await run("gh", ["auth", "status"]);
  } catch {
    console.error(
      "gh is not authenticated.\n\n" +
        "  Run:  gh auth login          (or set GH_TOKEN)\n\n" +
        "This script is a developer tool — nothing in the build depends on it.",
    );
    process.exit(1);
  }
}

async function syncLabels(repo) {
  console.log("\nLabels");
  const existing = new Map(
    (await gh(["label", "list", "--repo", repo, "--limit", "200", "--json", "name,color,description"])).map(
      (l) => [l.name, l],
    ),
  );

  for (const label of labels) {
    const current = existing.get(label.name);
    if (!current) {
      say("create", label.name);
      created += 1;
      if (APPLY) {
        await gh(
          ["label", "create", label.name, "--repo", repo, "--color", label.color, "--description", label.description],
          { json: false },
        );
      }
      continue;
    }
    if (current.color.toLowerCase() !== label.color.toLowerCase() || current.description !== label.description) {
      say("update", label.name);
      updated += 1;
      if (APPLY) {
        await gh(
          ["label", "edit", label.name, "--repo", repo, "--color", label.color, "--description", label.description],
          { json: false },
        );
      }
      continue;
    }
    unchanged += 1;
  }
}

async function syncMilestones(repo) {
  console.log("\nMilestones");
  const existing = new Map(
    (await gh(["api", `repos/${repo}/milestones?state=all&per_page=100`])).map((m) => [m.title, m]),
  );
  const byPhase = new Map();

  for (const phase of phases) {
    const current = existing.get(phase.title);
    const want = { title: phase.title, description: phase.description, state: phase.state ?? "open" };

    if (!current) {
      say("create", phase.title);
      created += 1;
      if (APPLY) {
        const made = await api("POST", `repos/${repo}/milestones`, want);
        byPhase.set(phase.id, made.number);
      }
      continue;
    }

    byPhase.set(phase.id, current.number);
    if (current.description !== want.description || current.state !== want.state) {
      say("update", phase.title);
      updated += 1;
      if (APPLY) await api("PATCH", `repos/${repo}/milestones/${current.number}`, want);
    } else {
      unchanged += 1;
    }
  }

  return byPhase;
}

function bodyFor(issue, phase) {
  const parts = [marker(issue.id), ""];
  if (issue.spec) {
    parts.push(`**Spec:** \`${issue.spec}\` — Claude Design project \`deea797d-e4b5-409c-b32f-f5f926846bb6\``, "");
  }
  parts.push(issue.body, "");
  if (issue.acceptance?.length) {
    parts.push("### Acceptance", ...issue.acceptance.map((a) => `- [ ] ${a}`), "");
  }
  parts.push(
    "### Done means",
    "- `npm run verify` passes",
    "- Verified in the browser at desktop and mobile widths",
    `- The commit that finishes this says \`Closes #<this issue>\``,
    "",
    `_${phase.title} — generated from \`scripts/roadmap.mjs\`; edit there, not here._`,
  );
  return parts.join("\n");
}

async function syncIssues(repo, milestoneByPhase) {
  console.log("\nIssues");
  const existing = await gh([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    "500",
    "--json",
    "number,title,body,state",
  ]);

  const byMarker = new Map();
  for (const issue of existing) {
    const found = /<!-- roadmap:([a-z0-9-]+) -->/.exec(issue.body ?? "");
    if (found) byMarker.set(found[1], issue);
  }

  for (const phase of phases) {
    for (const issue of phase.issues ?? []) {
      const current = byMarker.get(issue.id);
      const body = bodyFor(issue, phase);
      const milestone = milestoneByPhase.get(phase.id);

      if (!current) {
        say("create", `${issue.title}${issue.done ? "  (closed: history)" : ""}`);
        created += 1;
        if (!APPLY) continue;

        const args = ["issue", "create", "--repo", repo, "--title", issue.title, "--body", body];
        for (const label of issue.labels ?? []) args.push("--label", label);
        if (milestone !== undefined) args.push("--milestone", phase.title);
        const url = await gh(args, { json: false });

        // Seeded history closes immediately so a finished phase reads 100%.
        if (issue.done) {
          const number = url.trim().split("/").pop();
          await gh(["issue", "close", number, "--repo", repo, "--reason", "completed"], { json: false });
        }
        continue;
      }

      // Body drift is the only thing worth pushing back; state is not ours.
      if ((current.body ?? "").trim() !== body.trim() || current.title !== issue.title) {
        say("update", `#${current.number} ${issue.title}`);
        updated += 1;
        if (APPLY) {
          const args = ["issue", "edit", String(current.number), "--repo", repo, "--title", issue.title, "--body", body];
          for (const label of issue.labels ?? []) args.push("--add-label", label);
          if (milestone !== undefined) args.push("--milestone", phase.title);
          await gh(args, { json: false });
        }
      } else {
        unchanged += 1;
      }
    }
  }
}

await ensureAuth();

const repo = (await gh(["repo", "view", "--json", "nameWithOwner"])).nameWithOwner;
console.log(`${APPLY ? "Applying" : "Previewing"} roadmap → ${repo}`);

const milestoneByPhase = await syncMilestones(repo);
await syncLabels(repo);
await syncIssues(repo, milestoneByPhase);

console.log(
  `\n${created} to create, ${updated} to update, ${unchanged} unchanged.` +
    (APPLY ? "" : "\n\nNothing was changed. Re-run with `npm run roadmap:apply` to apply."),
);
