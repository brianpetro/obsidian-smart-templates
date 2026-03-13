**Turn your existing Markdown templates into reusable AI workflows.**

> Build better prompts from the notes you already trust.

> [!NOTE] Why Smart Templates?
> Every AI prompt is a mini project: gather the right notes, explain the task, paste the structure, and remind the model how to answer. Smart Templates turns that repeated setup into one guided flow inside Obsidian.

# Smart Templates

![[Templates-Context-Pro-Modal-2026-03-13.png]]

> [!QUESTION] Is this you?
> You already have useful note structures in your vault: meeting notes, research outlines, recommendation tables, writing briefs, summaries, postmortems.
> But when you use ChatGPT, Claude, or Gemini, you still rebuild the same prompt by hand.

> [!NOTE] What Smart Templates does
> Smart Templates helps you select context, apply one or more templates, and copy a ready-to-run prompt for any AI chat.
> Core focuses on prompt building and clipboard workflows. Pro adds in-Obsidian generation.

- Works with templates you already keep in your vault
- Starts from your current note or editor selection
- Lets you refine context before you copy
- Supports one or more templates in the same request
- Copies a ready-to-run prompt for any AI chat
- Local-first and privacy-preserving by default
- No API setup required in Core

> [!SUCCESS] What success looks like
> You stop rebuilding prompts from scratch. Your best structures become reusable workflows. AI outputs follow the shape you want because the template and context travel together.

> [!FAILURE] The cost of doing nothing
> Keep hand-assembling the same prompt scaffolding over and over. Lose flow. Get outputs that drift from your format. Let your best templates stay trapped inside notes instead of becoming reusable AI workflows.

## Quick start

1. Install and enable Smart Templates from Community plugins.
2. Open `Smart Templates: Open template context` from the command palette or ribbon.
3. Your current note or editor selection becomes the starting context.
4. Add more context if needed, choose one or more templates, and add optional instructions.
5. Click `Copy prompt`, then paste it into ChatGPT, Claude, Gemini, or any other chat UI.

<!-- TODO: Add annotated screenshot of the modal here -->

## Why Obsidian users get the epiphany fast

Your templates already define what good output looks like.

Smart Templates does not ask you to replace them with another system.
It turns them into reusable AI workflows.

That is the whole pitch:
**Structure once in your vault. Reuse everywhere.**

## What you can use it for

- Turn a meeting template into a meeting summary prompt
- Turn a research outline into a synthesis prompt
- Turn a writing brief into a draft prompt
- Turn your house note format into a rewrite prompt
- Turn specific headings into reusable block-level templates
- Merge multiple templates when one output needs more than one constraint

## Works with your existing templates

Smart Templates can discover templates from the patterns you already use in your vault.

<details><summary><span style="cursor: pointer;">How template discovery works</span></summary>

Templates can be discovered from:

- Configured template folders
- The Obsidian Templates folder as a fallback
- Notes flagged with `smart template: true`
- A configured template filename
- Matching block headings

Built-in defaults remain available even if you do not have any vault-backed templates yet.

Current built-in defaults:
- Add tags
- Create summary
- Research paper
- Diagram

</details>

## Context first, not template first

Most template workflows start with a template.
Smart Templates starts with the work in front of you.

Open it from the note you are writing, or from a selection inside that note.
Then refine the context, choose the template, and copy the final prompt.

That keeps the workflow grounded in what you are actually trying to do.

## Core and Pro

**Core**
- Discover templates in your vault
- Build a prompt from context + template
- Copy the final prompt to clipboard
- Use it with any external AI chat

**Pro**
- Generate inside Obsidian
- Review streamed output
- Copy, insert, or create a note
- Choose a generate model inside Smart Templates settings

## Private by design

Core uses a clipboard-first workflow.
Your notes stay local unless you choose to paste the copied prompt into an external AI tool.

## Mission-driven

Smart Templates is part of the Smart Plugins ecosystem: local-first, user-aligned tools for thinking and creating inside Obsidian.

> [!INFO] Your guide
> Built by Brian Petro, a fellow Obsidian user building Smart Plugins for real vault workflows.

## FAQ

<details><summary><span style="cursor: pointer;">Do I need an API key?</span></summary>
No for Core. Core builds and copies prompts so you can use any chat interface you already prefer. Pro adds in-Obsidian generation.
</details>

<details><summary><span style="cursor: pointer;">Does this replace Obsidian Templates or Templater?</span></summary>
No. Smart Templates is best understood as a bridge between your vault templates and AI workflows. Keep the Markdown templates you already like. Smart Templates helps package them with context.
</details>

<details><summary><span style="cursor: pointer;">Can I generate inside Obsidian?</span></summary>
Yes, in Pro. Core is intentionally focused on prompt building and prompt copy.
</details>

## More Smart Plugins

- Smart Context: gather the right notes fast
- Smart Connections: find related notes
- Smart Chat: keep AI conversations in notes

## License

Source available under the Smart Plugins License.