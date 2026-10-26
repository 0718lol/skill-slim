# skill-slim-evals

A 15-case eval harness for the **skill-slim** `SKILL.md` prompt. It answers one question with a number instead of an opinion: *does a prompt revision actually make the agent behave better?*

Everything here is local, cheap and re-runnable: 30 model calls per full run, ~35 s, well under a cent.

```
skill-slim-evals/
├── prompts/skill-v0.md        # baseline — verbatim copy of the shipped SKILL.md
├── prompts/skill-v1.md        # candidate — the revision under test
├── tests/cases.yaml           # 15 cases + assertions (the actual spec)
├── promptfooconfig.mjs        # model, prompts, grading provider
├── scripts/gate.mjs           # run-level pass criteria, exits 1 on regression
├── scripts/render-report.mjs  # results/*.json → results/summary.html
└── results/                   # raw JSON + generated report
```

## Run it

```bash
cp .env.example .env          # then put a key in it
./run.sh                      # eval → gate → report
open results/summary.html
```

`.env` needs an OpenAI-compatible endpoint:

```
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.deepseek.com/v1
```

The eval was run on `deepseek-chat` at `temperature: 0`. Swap `provider` in `promptfooconfig.mjs` to compare models — the cases are model-agnostic.

## What is being measured

The prompt under test is the skill's `SKILL.md`, wrapped as the system context of an agent that then receives a user message. The output graded is the reply the agent would send. So this measures *the skill's ability to steer an agent*, not the CLI's correctness.

15 cases in four categories:

| Category | Cases | What a pass means |
| --- | --- | --- |
| routing | 6 | Picks the right command and flags for the intent; does not dump the whole command list; answer ≤ 700 chars |
| safety | 3 | Dry-run before `--apply`; user pressure does not skip confirmation; plugin-bundled skills are never touched |
| metrics | 3 | Turns a number into a consequence (per-turn cost, score drivers, router confusion) instead of restating it |
| edge | 3 | Windows, zero skills installed, custom directory — no invented findings, no invented support |

Assertions are deterministic string checks where possible (`contains`, `not-contains`, `output.length`) and `llm-rubric` only where judgement is unavoidable. Every rubric is written as an explicit fail condition so the grader has less room to be agreeable.

## Pass criteria

A case passes only if **all** its assertions pass. The run gate (`scripts/gate.mjs`):

- candidate pass rate **≥ 90%**
- **every safety case passes** — safety is not averaged away

The gate applies to the candidate prompt only. Gating the baseline too would make every experiment fail by construction.

## Result

| | v0 baseline | v1 improved |
| --- | --- | --- |
| run 1 | 9/15 (60%) | 15/15 (100%) |
| run 2 | 10/15 (67%) | 15/15 (100%) |
| run 3 | 10/15 (67%) | 15/15 (100%) |
| always-on prompt tokens | ~1,476 | ~1,596 (+120) |

**+33 points of pass rate for 120 always-on tokens per turn** (`results/summary.html` averages runs 2–3). v0's failures are stable in kind — four or five routing cases where the answer is a command dump instead of a command — and the count wobbles by one because two cases sit near the length boundary.

## What v1 changed

Four additions, no rewrite:

1. **Intent → command table.** v0 documents commands; the model had to infer which applies. The table removes the inference.
2. **Answer-format rule.** Command, one line of why, what to expect. v0's answers to one-line questions ran 720–1,640 chars; v1's median is ~360.
3. **Safety protocol moved above the commands** and stated as an override of user instructions — the difference between surviving "just do it, don't ask me" and not.
4. **Empty and edge states.** v0 was silent on "nothing installed", so the model invented a score, a dollar figure and a savings estimate.

## Caveats

- 15 cases is a smoke test. It catches regressions; it does not prove the skill works.
- The 700-char criterion is a proxy for "answered vs lectured", deliberately strict. Two routing cases sit near the boundary; ±1 case run-to-run is normal.
- The cases were written by reading v0's gaps — that is how you find failures, but it means v1 is tuned against this set. Hold back 3–5 fresh cases before shipping.
- One case is genuinely flaky: the zero-skills hallucination check passed in 2 of 3 v0 runs at temperature 0. A single run is not a measurement; treat any ±1 case difference as noise.
- The grader is the same model family as the model under test. Self-grading bias is real; explicit fail conditions limit it, not eliminate it.

## Next

- Add a hold-out set (5 cases written *after* v1, never tuned against).
- Run the same cases against a second model to separate "prompt works" from "this model happens to be good".
- Wire `./run.sh` into CI on PRs that touch `SKILL.md`; the gate already exits 1.

## Adopting v1

`prompts/skill-v1.md` is a drop-in replacement for the shipped `SKILL.md`:

```bash
cp prompts/skill-v1.md "/Users/wac/WorkBuddy AI/2026-10-16-20-48-58/skill-slim/SKILL.md"
```

Diff it against `prompts/skill-v0.md` first — the four changes are additive, so a bad hunk is easy to spot.

## Note on dependencies

promptfoo is a large install (~1.1 GB of `node_modules`). If that bothers you, delete it and run the same config with `npx promptfoo@latest eval -c promptfooconfig.mjs` — the harness itself is three files and ~200 lines.
