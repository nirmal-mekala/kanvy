// Keeps ctx/support/migrate-v6-to-v7.mjs (a standalone, dependency-free
// data-migration fixture) in sync with this app's own schema: runs it as a
// CLI against a v6 document covering every v6 → v7 change, and asserts the
// output both validates against BoardSchema and matches what
// normalizeLegacyBoard (the app's own localStorage migration) produces. A
// schema change in the v6 → v7 pass that the script doesn't also make
// fails here.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BoardSchema, SCHEMA_VERSION } from './board'
import { normalizeLegacyBoard } from './legacy'

const SCRIPT = fileURLToPath(
  new URL('../../ctx/support/migrate-v6-to-v7.mjs', import.meta.url),
)

const ROOT_ID = 'h0me0b0ard00'
const now = '2026-01-01T00:00:00.000Z'

/** A v6 link card with its nested `link` object — status included, as v6 persisted it. */
function v6LinkCard(
  id: string,
  position: number,
  link: Record<string, unknown>,
) {
  return {
    id,
    boardId: ROOT_ID,
    type: 'card',
    kind: 'link',
    content: '',
    x: 0,
    y: 0,
    w: 224,
    h: 90,
    color: 'gray',
    link,
    status: 'active',
    index: position,
    createdAt: now,
    updatedAt: now,
  }
}

function v6Container(id: string, index: number, task?: unknown) {
  return {
    id,
    boardId: ROOT_ID,
    type: 'container',
    pattern: 'none',
    x: 0,
    y: 0,
    w: 128,
    h: 96,
    color: 'gray',
    ...(task === undefined ? {} : { task }),
    status: 'active',
    index,
    createdAt: now,
    updatedAt: now,
  }
}

/** A complete v6 document exercising every v6 → v7 node change. */
function v6Document() {
  return {
    version: 6,
    nodes: [
      v6Container('task-done', 0, { status: 'done' }),
      v6Container('task-blocked', 1.5, { status: 'blocked' }),
      v6Container('no-task', 2),
      v6Container('null-task', 3, null),
      v6Container('empty-wrapper', 4, {}),
      v6LinkCard('link-full', 4.5, {
        url: 'https://a.example',
        title: 'A',
        imageUrl: 'https://a.example/og.png',
        status: 'ready',
      }),
      v6LinkCard('link-loading', 4.75, {
        url: 'https://b.example',
        status: 'loading',
      }),
      {
        id: 'text',
        boardId: ROOT_ID,
        type: 'card',
        kind: 'text',
        size: 'h2',
        content: 'hi',
        x: 0,
        y: 0,
        w: 224,
        h: 90,
        color: 'violet',
        task: { status: 'in_progress' },
        status: 'trashed',
        index: 5,
        createdAt: now,
        updatedAt: now,
      },
    ],
    edges: [
      {
        id: 'e1',
        boardId: ROOT_ID,
        fromNodeId: 'task-done',
        fromSide: 'right',
        toNodeId: 'text',
        toSide: 'left',
        direction: 'forward',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    boards: [
      {
        id: ROOT_ID,
        title: 'Home',
        status: 'active',
        isRoot: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    images: [{ id: 'img1', dataUri: 'data:image/png;base64,aaa' }],
  }
}

/** Writes `contents` to a fresh temp file and returns its path — the script reads its input from a file, not an argument. */
function tempFile(contents: string): string {
  const path = join(
    mkdtempSync(join(tmpdir(), 'kanvy-migrate-v6-')),
    'board.json',
  )
  writeFileSync(path, contents)
  return path
}

function runScript(path?: string) {
  return spawnSync('node', path === undefined ? [SCRIPT] : [SCRIPT, path], {
    encoding: 'utf8',
  })
}

function migrate(document: unknown): unknown {
  return JSON.parse(
    execFileSync('node', [SCRIPT, tempFile(JSON.stringify(document))], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  )
}

describe('ctx/support/migrate-v6-to-v7.mjs', () => {
  it('targets the current schema version (update the script alongside SCHEMA_VERSION)', () => {
    expect(SCHEMA_VERSION).toBe(7)
  })

  it('produces a document that validates against the current BoardSchema', () => {
    const result = BoardSchema.safeParse(migrate(v6Document()))
    expect(result.error?.issues).toBeUndefined()
  })

  it("matches the app's own v6 → v7 localStorage migration exactly", () => {
    const fromScript = BoardSchema.parse(migrate(v6Document()))
    const fromApp = BoardSchema.parse(normalizeLegacyBoard(v6Document()))
    expect(fromScript).toEqual(fromApp)
  })

  it('maps each node’s task, index, type and kind as expected, dropping the old keys', () => {
    const migrated = migrate(v6Document()) as {
      nodes: Record<string, unknown>[]
    }
    expect(
      migrated.nodes.map(({ id, task, position, nodeType, cardType }) => ({
        id,
        task,
        position,
        nodeType,
        cardType,
      })),
    ).toEqual([
      { id: 'task-done', task: 'done', position: 0, nodeType: 'container' },
      {
        id: 'task-blocked',
        task: 'blocked',
        position: 1.5,
        nodeType: 'container',
      },
      { id: 'no-task', task: 'none', position: 2, nodeType: 'container' },
      { id: 'null-task', task: 'none', position: 3, nodeType: 'container' },
      { id: 'empty-wrapper', task: 'none', position: 4, nodeType: 'container' },
      {
        id: 'link-full',
        task: 'none',
        position: 4.5,
        nodeType: 'card',
        cardType: 'link',
      },
      {
        id: 'link-loading',
        task: 'none',
        position: 4.75,
        nodeType: 'card',
        cardType: 'link',
      },
      {
        id: 'text',
        task: 'in_progress',
        position: 5,
        nodeType: 'card',
        cardType: 'text',
      },
    ])
    for (const node of migrated.nodes) {
      for (const oldKey of ['index', 'type', 'kind', 'link']) {
        expect(node).not.toHaveProperty(oldKey)
      }
    }
  })

  it('flattens each link card’s nested link in place, null-filling missing title/image and dropping status', () => {
    const migrated = migrate(v6Document()) as {
      nodes: Record<string, unknown>[]
    }
    const links = migrated.nodes.filter((node) => node.cardType === 'link')
    expect(links).toEqual([
      expect.objectContaining({
        linkUrl: 'https://a.example',
        linkTitle: 'A',
        linkImageUrl: 'https://a.example/og.png',
      }),
      expect.objectContaining({
        linkUrl: 'https://b.example',
        linkTitle: null,
        linkImageUrl: null,
      }),
    ])
    for (const node of links) {
      expect(node).not.toHaveProperty('link')
      expect(node).not.toHaveProperty('linkStatus')
    }
    const keys = Object.keys(links[0] ?? {})
    expect(
      keys.slice(keys.indexOf('color') + 1, keys.indexOf('status')),
    ).toEqual(['linkUrl', 'linkTitle', 'linkImageUrl'])
  })

  it('puts each renamed key where its old key was in the node’s key order', () => {
    const [v6Text] = v6Document().nodes.slice(-1)
    const migrated = migrate(v6Document()) as {
      nodes: Record<string, unknown>[]
    }
    const renamed = { index: 'position', type: 'nodeType', kind: 'cardType' }
    const expectedKeys = Object.keys(v6Text ?? {}).map(
      (key) => renamed[key as keyof typeof renamed] ?? key,
    )
    expect(Object.keys(migrated.nodes.at(-1) ?? {})).toEqual(expectedKeys)
  })

  it('migrates a board far larger than the OS single-argument limit (~128KB) — input is read from a file, not passed inline', () => {
    const base = v6Document()
    const template = base.nodes[0]
    const nodes = Array.from({ length: 2000 }, (_, i) => ({
      ...template,
      id: `bulk-${i}`,
      index: i,
    }))
    const document = { ...base, nodes }
    expect(JSON.stringify(document).length).toBeGreaterThan(256 * 1024)
    const migrated = migrate(document) as { nodes: unknown[] }
    expect(migrated.nodes).toHaveLength(2000)
    expect(BoardSchema.safeParse(migrated).error?.issues).toBeUndefined()
  })

  it.each([
    [
      'a non-v6 document',
      () => tempFile(JSON.stringify({ version: 5, nodes: [] })),
      /v6/,
    ],
    ['invalid JSON', () => tempFile('nope'), /JSON/],
    [
      'a missing file',
      () => join(tmpdir(), 'kanvy-no-such-board.json'),
      /ENOENT/,
    ],
  ])(
    'rejects %s with exit code 1 and a stderr message',
    (_label, makePath, message) => {
      const result = runScript(makePath())
      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(result.stderr).toMatch(message)
    },
  )

  it('prints usage and exits 1 with no argument', () => {
    const result = runScript()
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/usage/)
  })
})
