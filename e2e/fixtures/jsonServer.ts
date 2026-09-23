import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

export async function startJsonServer(
  db: unknown,
  port: number,
): Promise<JsonServerHandle> {
  const dir = mkdtempSync(join(tmpdir(), 'kanvy-e2e-json-server-'))
  const dbPath = join(dir, 'db.json')
  writeFileSync(dbPath, JSON.stringify(db))

  const child: ChildProcess = spawn(
    'npx',
    ['json-server', dbPath, '--port', String(port)],
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

  return {
    port,
    stop: () =>
      new Promise<void>((resolve) => {
        child.once('exit', () => resolve())
        child.kill()
      }),
  }
}
