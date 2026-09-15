#!/usr/bin/env node
/**
 * Extracts the developer's own typed input from Claude Code .jsonl session
 * transcripts, discarding tool output, attachments, thinking blocks, and
 * everything else that makes the raw transcripts huge. The result is
 * intended to be small enough for an agent to read in full and delineate
 * the preferences the developer has expressed across sessions.
 *
 * Usage:
 *   node extract-human-input.js <directory-of-jsonl-files>
 *
 * Prints JSON to stdout.
 */

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const dirArg = process.argv[2];
if (!dirArg) {
  fail("usage: node extract-human-input.js <directory-of-jsonl-files>");
}

const dir = path.resolve(dirArg);
let entries;
try {
  entries = fs.readdirSync(dir, { withFileTypes: true });
} catch (err) {
  fail(`could not read directory: ${dir} (${err.message})`);
}

const files = entries
  .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
  .map((e) => e.name)
  .sort();

if (files.length === 0) {
  fail(`no .jsonl files found in ${dir}`);
}

// A message counts as genuine developer input only when it was typed
// directly by the human (not a tool_result, not a compaction summary,
// not an interrupted-request marker, not a subagent/sidechain turn).
function isHumanTypedMessage(entry) {
  return (
    entry.type === "user" &&
    entry.isSidechain === false &&
    entry.promptSource === "typed" &&
    entry.origin &&
    entry.origin.kind === "human" &&
    typeof entry.message === "object" &&
    typeof entry.message.content === "string"
  );
}

const sessions = [];
let totalMessages = 0;
let malformedLines = 0;

for (const fileName of files) {
  const filePath = path.join(dir, fileName);
  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  let sessionId = null;
  let cwd = null;
  let gitBranch = null;
  let title = null;
  const messages = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch (err) {
      malformedLines++;
      continue;
    }

    if (entry.sessionId && !sessionId) sessionId = entry.sessionId;

    if (entry.type === "ai-title" && entry.aiTitle) {
      title = entry.aiTitle;
    }

    if (isHumanTypedMessage(entry)) {
      if (!cwd && entry.cwd) cwd = entry.cwd;
      if (!gitBranch && entry.gitBranch) gitBranch = entry.gitBranch;
      messages.push({
        timestamp: entry.timestamp || null,
        text: entry.message.content,
      });
    }
  }

  if (messages.length === 0) continue;

  totalMessages += messages.length;
  sessions.push({
    sessionId: sessionId || fileName,
    file: fileName,
    title,
    cwd,
    gitBranch,
    startTime: messages[0].timestamp,
    endTime: messages[messages.length - 1].timestamp,
    messageCount: messages.length,
    messages,
  });
}

const output = {
  generatedAt: new Date().toISOString(),
  sourceDirectory: dir,
  totals: {
    files: files.length,
    sessions: sessions.length,
    messages: totalMessages,
    malformedLines,
  },
  sessions,
};

process.stdout.write(JSON.stringify(output, null, 2) + "\n");
