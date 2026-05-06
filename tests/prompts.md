# Prompt 1 — Search by resource key

Using only the PatternFly MCP tools: call searchPatternFlyDocs with searchQuery "AiGuidelines". Summarize what URLs and names come back and confirm any raw.githubusercontent.com/project-felt/ai-guidelines URLs appear.

# Prompt 2 — Search by distinctive phrase

Using only the PatternFly MCP tools: call searchPatternFlyDocs with searchQuery "transparency notices". Then call searchPatternFlyDocs with searchQuery "chatbot avatars". For each, say whether the results include project-felt ai-guidelines raw markdown URLs.

# Prompt 3 — Search by topic keywords

Using only the PatternFly MCP tools: run searchPatternFlyDocs three times with searchQuery "ai design principles", then "animation", then "iconography". Report which hits map to project-felt ai-guidelines content.

# Prompt 4 — Fetch one file by URL (recommended)

Using only the PatternFly MCP tools: call searchPatternFlyDocs with searchQuery "ai design principles". From the results, take the raw GitHub URL for ai-design-principles.md, call usePatternFlyDocs with urlList containing only that URL, and paste the first markdown heading line from the response.

# Prompt 5 — Fetch whole AiGuidelines bundle by name

Using only the PatternFly MCP tools: call usePatternFlyDocs with name "AiGuidelines". Confirm the markdown mentions AI design principles, transparency, and legal requirements (quote one short line from the response for each theme if present).

# Prompt 6 — Version filter (if your tools expose version)

Using only the PatternFly MCP tools: call searchPatternFlyDocs with searchQuery "legal requirements" and version "v6". Then call usePatternFlyDocs with the URL list from that hit only (or name "AiGuidelines" if URLs are messy) and paste one sentence about legal review from the markdown.

# Prompt 7 — After editing docs.json locally

I changed src/docs.json and ran npm run build. Using only the PatternFly MCP tools, search for "felt" or "ai-guidelines" and fetch one matching doc with usePatternFlyDocs to prove the updated catalog is live.







# Human-sounding MCP test prompts (no tool names)

These are written so a good agent *should* fetch official PatternFly / Felt content instead of free-styling. They do **not** mention `searchPatternFlyDocs`, `usePatternFlyDocs`, or “MCP.”

## Felt / `project-felt/ai-guidelines` (catalog: AiGuidelines)

- What do the Felt AI guidelines say about **transparency notices** when the product uses generative AI? Cite the doc, not general advice.
- Summarize the **legal review** expectations for shipping an AI feature, per the **project-felt ai-guidelines** content.
- How should we treat **color** in UI for AI features? Pull guidance from the Felt AI guidelines, not PatternFly’s generic color page unless that’s the only source.
- What are the **chatbot avatar** rules (icons, launch affordances) in the Felt AI guidelines?
- List the main **AI design principles** from the Felt guidelines in short bullets, with one example each.
- What does the Felt material say about **animation** and **sparkle** effects for AI features?
- Compare **iconography** guidance for “AI” affordances (sparkles, etc.) in the Felt guidelines—what to use and what to avoid?

## PatternFly (components / v6)

- I’m building a **Button** in PatternFly v6. What are the **accessibility** must-dos for `Button` (keyboard, `aria-label`, disabled behavior)?
- For **DataList** in v6, what does the official doc say about **selection** or **row actions**—quote the relevant bit.
- What’s the difference between **primary** and **secondary** actions in a **Modal** flow, per PatternFly’s guidance for the **Modal** component?

## “Doc-only” follow-ups (if answers feel generic)

- In the Felt **transparency** doc, what should we show near an AI-generated answer? Be specific to that document.
- Per the Felt **legal** doc, when do we need **Product Legal** (or equivalent) sign-off before release?

## Soft nudge (still no tool names)

If the model answers from memory only, try: *“Open the official markdown in our PatternFly / Felt catalog and quote the first heading.”*



## Neutral prompts (no product or doc names)

### Transparency & disclosure

- When we ship a feature that calls a generative model, what should users see **before** they start typing or get an answer—especially around **personal or sensitive** input?
- What’s the minimum we should do so it’s **obvious** the experience involves generated output—not just a tiny badge somewhere?
- For a **chat-style assistant** embedded in our app, what **persistent** reminders should sit near the input/output area about reviewing outputs?
- For **summaries** or **auto-generated blurbs** in search or results pages, how should we label them so users know they’re **model-generated**?
- Why might **labeling every AI-generated image** on a page be a bad idea? What’s the alternative approach suggested for broader notices?

### Risk, review, and policy

- Before we release customer-facing capabilities backed by generative models, what **review or consultation** steps does our internal material expect (named roles/processes as written)?
- What topics does our doc treat as needing **extra care** or **more indicators** when stakes are higher?

### Visual design (icons, motion, color)

- What rules do we follow for **sparkles**, **stars**, or similar **“AI” affordances** in icons—what to prefer and what to avoid?
- How should **motion** or **animation** be used around generative features so it helps recognition without being gratuitous?
- Are there **color** constraints or preferences when marking AI-related UI so it stays on-brand and accessible?

### Chat UX & affordances

- How should we handle **avatars**, **robot metaphors**, and **launch entry points** for an assistant so they’re clear but not misleading?

### Principles & framing

- What **design principles** does our internal doc give for experiences that include generative capabilities—framed as product goals, not implementation detail?

### Doc-grounding nudge (still neutral)

- Answer using **our internal markdown** only: quote the **first heading** and **one bullet** from the transparency section that applies to **virtual assistants**.
