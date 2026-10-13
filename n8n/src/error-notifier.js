// Formats any unexpected workflow error for the team.
// Set TEAM_EMAIL below (same address as in the main workflow's Config node).
const TEAM_EMAIL = 'PASTE_TEAM_EMAIL';
const data = $input.first().json || {};
const exec = data.execution || {};
const wf = data.workflow || {};
const err = exec.error || {};
return [{
  json: {
    to: TEAM_EMAIL,
    subject: `[GostProcess IG] Workflow error in ${wf.name || 'workflow'}`,
    body: [
      `Workflow: ${wf.name || '-'}`,
      `Failed node: ${exec.lastNodeExecuted || '-'}`,
      `Error: ${err.message || '-'}`,
      `Execution: ${exec.url || exec.id || '-'}`,
      '',
      'See docs/03-operations.md > Troubleshooting.',
    ].join('\n'),
  },
}];
