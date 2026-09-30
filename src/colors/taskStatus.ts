// Task-status colors live in styles/tokens.css (`--color-task-*`, spec
// §3/§6.1): `todo` neutral (theme-dependent), `blocked` red,
// `in_progress` blue, `done` green.

export type TaskStatus = 'todo' | 'blocked' | 'in_progress' | 'done'
