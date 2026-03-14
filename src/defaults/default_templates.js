import default_template_tags from './tags.md' with { type: 'markdown' };
import default_template_summary from './summary.md' with { type: 'markdown' };
import default_template_research_paper from './research_paper.md' with { type: 'markdown' };
import default_template_diagram from './diagram.md' with { type: 'markdown' };
import default_template_mermaid_diagram from './mermaid_diagram.md' with { type: 'markdown' };

export const default_templates = [
  {
    key: 'Add tags (default)',
    content: default_template_tags,
  },
  {
    key: 'Create summary (default)',
    content: default_template_summary,
  },
  {
    key: 'Research paper (default)',
    content: default_template_research_paper,
  },
  {
    key: 'Diagram (default)',
    content: default_template_diagram,
  },
  {
    key: 'Mermaid diagram (default)',
    content: default_template_mermaid_diagram,
  },
];
