export const documentsContractGroup = {
  tag: 'templates.documents',
  description: 'Document templates, generation tasks, numbering and generated artifact registries.'
} as const;

export const documentsEndpoints = {
  templates: ['/templates', '/templates/:id', '/templates/:id/archive', '/templates/:id/unarchive', '/templates/:id/set-current-version'],
  templateVersions: ['/template-versions', '/template-versions/:id', '/template-versions/:id/activate', '/template-versions/:id/parse-variables'],
  templateVariables: ['/template-variables', '/template-variables/:id'],
  templateBindings: ['/template-bindings', '/template-bindings/:id'],
  documents: ['/documents', '/documents/:id', '/documents/generate', '/documents/:id/finalize', '/documents/:id/archive', '/documents/:id/download'],
  documentTasks: ['/document-tasks', '/document-tasks/:id', '/document-tasks/:id/retry'],
  numberingRules: ['/numbering-rules', '/numbering-rules/:id', '/numbering-rules/:id/activate', '/numbering-rules/:id/deactivate']
} as const;
