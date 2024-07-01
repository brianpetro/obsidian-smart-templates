# Smart Commands for Obsidian

Smart Commands allows you to create and use configurable commands utilizing Smart Environments.

Smart Commands is a companion plugin to [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections/), a plugin for Obsidian that implements a Smart Environment for utilizing AI to enhance your notes.

## Features

### Smart Templates

Create and use customizable templates with dynamic variables.

- **AI-Powered**: Leverage AI models to generate content based on your templates, variable prompts, and current context (note or highlighted text).
- **Variable Prompts**: Define prompts for each variable for more control over content generation.
- **Flexible Configuration**: Choose your preferred AI model platform.

*More features coming soon...*:
- Integration with Smart Connections to retrieve additional context
- Integration with [Smart Memos](https://github.com/Mossy1022/Smart-Memos)
- Integration with [Smart Connections Visualizer](https://github.com/Mossy1022/Smart-Connections-Visualizer) for visual selection of nodes to use as context

## Installation

Currently in beta and requires manual installation.

## Usage

1. Set up your preferred AI model platform in the plugin settings.
2. Create smart templates in the designated templates folder.
3. Use the command palette to run your smart templates on your notes or selections.

## Configuration

### Model Platform

Choose your preferred AI model platform (e.g., OpenAI) and enter your API key in the settings.

### Templates Folder

Specify the folder where your smart templates will be stored.

### Variable Prompts

Customize the prompts for template variables like summary, notes, and mermaid charts.

## Creating Templates

1. Navigate to your designated templates folder.
2. Create a new Markdown file for your template.
3. Use special syntax like `{{ variable_name }}` to define dynamic parts of your template.

Example template:
```markdown
# Default Smart Template

### Summary
{{ summary }} <- Simple bracket syntax

### Notes
{{ notes }}

### Chart
<%- '```mermaid' %> <- EJS syntax is also available
{{ mermaid }}
<%- '```' %>
```

## How it Works

```mermaid
graph TD
  A[Smart Template] -->|Contains| B(Variable Placeholders)
  C[var_prompts] -->|Defines| D(Variable Prompts)
  E[Current Context] -->|Provides| F(Content for Processing)
  B --> G{Smart Commands Plugin}
  D --> G
  F --> G
  G -->|Processes| H(AI Model)
  H -->|Generates| I(Variable Content)
  I --> J{Template Rendering}
  A --> J
  J -->|Produces| K[Final Output]
```

## About

Created by [🌴 Brian](https://x.com/wfhbrian) as a companion plugin to [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections/), a plugin for Obsidian that implements a Smart Environment for utilizing AI to enhance your notes.

### Development

Uses [JSBrains](https://jsbrains.org/) to minimize dependencies and provide an easily adaptable architecture that supports new models and platforms.

- [Smart Templates](https://github.com/brianpetro/jsbrains/tree/main/smart-templates)
- [Smart Chat Model](https://github.com/brianpetro/jsbrains/tree/main/smart-chat-model)