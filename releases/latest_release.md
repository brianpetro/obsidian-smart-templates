# Smart Templates `v2.0.0` Release Notes

Smart Templates v2 is the new shared core for context-first templating in Obsidian.

## Highlights

- New context-first request flow
  - Open Smart Templates from the command palette or ribbon icon.
  - Current note is used as the starting context.
  - Editor selection overrides the active note when text is highlighted.
- Shared Template Context modal
  - Build or refine context on the left.
  - Select one or more templates on the right.
  - Add optional instructions and copy a ready-to-run prompt.
- Works with your existing templates
  - Configured template folders
  - Obsidian Templates folder fallback
  - Frontmatter flag: `smart template: true`
  - Configured filename via `template_name`
  - Matching block headings via `template_headings`
- Built-in defaults remain available even when no vault template matches
  - Add tags
  - Create summary
  - Research paper
  - Diagram
  - Mermaid diagram
- Multi-template merge
  - Templates are merged in stable selection order.
- Shared prompt assembly
  - `template.actions.template_build_prompt(...)`
  - `build_prompt_text(...)`
- Template reload listeners
  - Reloads when matching sources are created, renamed, modified, or deleted.
- Settings + release notes wiring now match the Smart Plugin standard flow.

## Core scope

Core stays clipboard-first.

- Build prompts from template + context
- Copy prompts to the clipboard
- Use any external AI chat without API setup

## Pro scope

Pro extends the shared modal with in-Obsidian generation.

- Generate directly from the same request panel
- Review output in `TemplateOutputModal`
- Copy, insert, or create a note from generated output
- Choose a Smart Templates generate model in Pro settings
