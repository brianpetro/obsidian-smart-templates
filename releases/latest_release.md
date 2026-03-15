# Smart Templates `v2`

Smart Templates v2 is the context-first release for reusable AI prompt workflows in Obsidian.

## What changed

- Replaced the legacy selector / completion / review chain with a shared Template Context modal.
- Core now focuses on prompt building and clipboard copy.
- Template discovery is settings-driven and includes built-in defaults.
- Template reloads now follow source lifecycle events.
- Settings tab and release notes now use the standard Smart Plugin flow.

## Detection rules

Templates are discovered from:

- configured template folders
- the Obsidian Templates folder as a fallback
- frontmatter flag `smart template: true`
- configured filename via `template_name`
- configured block headings via `template_headings`

## Core

- Open template context from the ribbon icon or command palette
- Add or refine context
- Select one or more templates
- Add optional instructions
- Copy prompt

## Pro

- Generate directly inside Obsidian from the shared request flow
- Review output in `TemplateOutputModal`
- Copy, insert, or create a note
- Override the generate model per request
