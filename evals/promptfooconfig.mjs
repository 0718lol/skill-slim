// promptfoo config (JS form).
// Why not YAML: promptfoo splits prompt FILES on `---` lines, and SKILL.md is full of
// YAML frontmatter and horizontal rules — a file-based prompt silently becomes 5 prompts.
// Passing the body as `raw` keeps each variant as exactly one prompt.
import { readFileSync } from 'node:fs';

const wrap = (skill) => `You are a coding agent working in a terminal. The following skill has been loaded into your context — this is the skill's SKILL.md, verbatim:

<skill>
${skill.trim()}
</skill>

The user now sends this message:

<user_request>
{{query}}
</user_request>

Write the reply you would send to the user. Follow the skill's instructions exactly. Do not mention that this is a test or an evaluation.`;

const provider = {
  id: 'openai:chat:deepseek-chat',
  label: 'deepseek-chat',
  config: { apiBaseUrl: 'https://api.deepseek.com/v1', temperature: 0, max_tokens: 900 },
};

export default {
  description: 'skill-slim SKILL.md — baseline (v0) vs tightened (v1)',
  prompts: [
    { label: 'v0-baseline', raw: wrap(readFileSync('prompts/skill-v0.md', 'utf8')) },
    { label: 'v1-improved', raw: wrap(readFileSync('prompts/skill-v1.md', 'utf8')) },
  ],
  providers: [provider],
  tests: ['file://tests/cases.yaml'],
  defaultTest: {
    options: {
      provider: { id: 'openai:chat:deepseek-chat', config: { apiBaseUrl: 'https://api.deepseek.com/v1', temperature: 0 } },
    },
  },
};
