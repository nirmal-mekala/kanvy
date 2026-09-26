import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The local binary directly, not `npx json-server` — `npx` runs its
// target as a genuine child *subprocess* rather than exec-replacing
// itself, so killing the `npx` process (as `stop()` below does) leaves
// the actual json-server process running underneath it, orphaned and
// still holding the port. That orphan is exactly what caused a follow-up
// `startJsonServer` call reusing the same port (this file's tests are
// serialized and deliberately reuse one port) to fail with `EADDRINUSE`.
const JSON_SERVER_BIN = join(
  process.cwd(),
  'node_modules',
  '.bin',
  'json-server',
)

/**
 * Spins up a real `json-server` instance against a throwaway `db.json` for
 * network-mode e2e specs (network mode design doc §8's "basic network-
 * mode board load/edit round trip against the json-server instance"). Runs
 * in-process (this is Node-side test code, not page code) and must bind a
 * port the *browser* driving the test can reach — in this container, that
 * means one of the host-forwarded ports (see AGENTS.md's
 * `playwright-remote-browser` note), passed in by the caller rather than
 * hardcoded here.
 */
export interface JsonServerHandle {
  port: number
  stop: () => Promise<void>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function spawnAndWait(
  dbPath: string,
  port: number,
): Promise<ChildProcess> {
  const child: ChildProcess = spawn(
    JSON_SERVER_BIN,
    [dbPath, '--port', String(port)],
    { stdio: 'pipe' },
  )

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('json-server did not start in time')),
        15_000,
      )
      let output = ''
      child.stdout?.on('data', (chunk: Buffer) => {
        output += chunk.toString()
        if (output.includes('Watching') || output.includes('Endpoints:')) {
          clearTimeout(timeout)
          resolve()
        }
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        // EADDRINUSE etc. — fail fast rather than waiting out the timeout.
        clearTimeout(timeout)
        reject(new Error(chunk.toString()))
      })
      child.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  } catch (error) {
    child.kill()
    throw error
  }
  return child
}

export async function startJsonServer(
  db: unknown,
  port: number,
): Promise<JsonServerHandle> {
  const dir = mkdtempSync(join(tmpdir(), 'kanvy-e2e-json-server-'))
  const dbPath = join(dir, 'db.json')
  writeFileSync(dbPath, JSON.stringify(db))

  // A just-`stop()`ped prior server on this same port (this file's tests
  // are serialized and reuse one port — see settingsNetworkMode.spec.ts)
  // can leave the OS socket in a brief release-in-progress state even
  // after its process has exited — retry past that transient EADDRINUSE
  // rather than failing the whole test on a timing fluke.
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const child = await spawnAndWait(dbPath, port)
      return {
        port,
        stop: () =>
          new Promise<void>((resolve) => {
            child.once('exit', () => resolve())
            child.kill()
          }),
      }
    } catch (error) {
      lastError = error
      if (!(error instanceof Error) || !error.message.includes('EADDRINUSE')) {
        throw error
      }
      await sleep(300)
    }
  }
  throw lastError
}
