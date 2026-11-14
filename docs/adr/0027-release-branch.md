# ADR 0027: Work goes into a rolling release branch, `release/next`

- Status: Proposed
- Date: 2026-11-14
- Issues: #523, #475, #478, #479
- Amends: [ADR 0015](0015-versioning-and-releases.md)

## Context

Every merge to `main` is a release (ADR 0015): a tag, a container image, the extension and the CLI attached. That
was right while a pull request was a finished feature. Since then the work is cut into small PBIs that are
implemented, reviewed and merged one after the other, partly by agents (the `deliver` skill of GravionLabs/skills).
Merged into `main`, each of them is a release of its own: twenty patch versions for one feature, most of them
without anything a user would notice, and a feature that is released half done.

The numbers 0025 and 0026 are reserved by #433 and #441.

## Decision

1. **Work is merged into `release/next`**, a rolling integration branch cut from `main`. Branches are
   `<type>/<nr>-<slug>`, cut from `release/next`; pull requests go into `release/next` and are squash-merged, so the
   pull request title, a Conventional Commit, is the one commit of the change.
2. **`main` is released code.** It receives the release pull request from `release/next`, merged with a merge
   commit (never squashed: GitVersion and git-cliff need the single `feat:` and `fix:` commits), by a person. A
   hotfix (`fix/<nr>-<slug>` from `main`, merge commit) is the only other way in; afterwards `main` is merged back
   into `release/next`.
3. **A milestone is a release.** A milestone (`M<nnn>`) holds the PBIs and bugs of one release; when they are
   merged, `release/next` is released and the milestone is closed with the version of the tag.
4. **An issue closes when its pull request is merged into `release/next`.** `Closes #n` only fires on the default
   branch, so the workflow `release-branch.yml` (GravionLabs/ci) closes the issues on every push to `release/**`,
   with the comment "ships with <milestone>", and keeps the release pull request open and current.
5. **The same checks guard both branches.** The workflows that run on pull requests into `main` run on pull requests
   into `release/**`, and the ruleset `release` requires the checks the ruleset `main` requires.
6. **After the release `release/next` is moved to `main`** by a fast-forward, never deleted and never continued
   (`github-release cut`).
7. **Renovate opens its pull requests into `release/next`** (`baseBranchPatterns`), like any other work.

What ADR 0015 says about the version (GitVersion, the tag, what is attached to a release) is unchanged: a merge to
`main` is still a release, there are only fewer of them.

## Consequences

- A release is a decision, not a side effect: one per milestone, with a changelog that reads as one.
- A fix reaches users later than before unless it is a hotfix; the hotfix path exists for that.
- A pull request never stacks on another feature branch (#332, #336): the base is `release/next`, or `main` for a
  hotfix. The `PR base` workflow checks it.
- Renovate reads its configuration from the default branch, so point 7 takes effect with the first release that
  contains it; until then its pull requests still target `main`.
- Agents need the flow in `AGENTS.md` and the verify commands there; `.agents/config.json` declares the ADR folder
  and the paths whose change asks for an ADR (`governance`), read by the pull request checks (#475).
