import { smart_completions } from "smart-completions";
import { TemplateCompletionAdapter } from "../adapters/smart-completions/template.js";
smart_completions.completion_adapters['TemplateCompletionAdapter'] = TemplateCompletionAdapter;
export default smart_completions;
