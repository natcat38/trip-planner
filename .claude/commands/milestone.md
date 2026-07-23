Run the milestone loop for the trip-planner repo.

1. ORIENT
   - Read everything in docs/ (including docs/adr/) and knowledge/ before touching
     anything else. Read CLAUDE.md.
   - Summarize current state in a few lines: what's implemented, what's stubbed,
     what's just documented intent.

2. PLAN
   - Identify the next unimplemented milestone from docs/. If it's ambiguous which one
     is next, ask me instead of guessing.
   - Write a numbered implementation plan: files/modules to touch, any Prisma schema
     changes, new API routes or components, and how it fits the Vercel + Neon +
     gated-Actions setup (see docs/adr/0001 and 0002).
   - Call out open decisions explicitly instead of silently picking one for me.
   - Stop here and show me the plan. Do not write code until I approve it.

3. IMPLEMENT (after I approve the plan)
   - Work on a branch; changes land via PR with green CI (branch protection on main).
   - Small, reviewable increments — one logical change per pass, not a giant diff.
   - Match existing conventions already in the repo; if you want to introduce a new
     pattern, flag it and say why before doing it.
   - Write or update tests alongside the code, not as an afterthought.

4. VERIFY
   - Run the test suite and linter (npm run test, npm run lint, npx tsc --noEmit).
   - For any schema change, generate/run the Prisma migration and confirm it applies
     cleanly against the local docker-compose Postgres.
   - Diff the result against the plan from step 2 and note any drift.

5. CLOSE THE LOOP
   - Give me a summary of what changed and why, written so I can paste it straight
     into a commit message.
   - Record any decisions made as docs/adr/ entries; update knowledge/ if the domain
     language changed (it is CI-validated — keep frontmatter intact).
   - Tell me what the next milestone should be so we can start the loop again.
