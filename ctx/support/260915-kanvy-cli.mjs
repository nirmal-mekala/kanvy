#!/usr/bin/env node
// Throwaway CRUD smoke-test CLI for exercising 260915-kanvy-db-sample.json
// against `json-server`. Not part of the app — support material only,
// per ctx/prompt/260915-migration-process.md phase 2.
//
// Setup:
//   npx json-server ctx/support/260915-kanvy-db-sample.json --port 3000
//
// Usage:
//   node ctx/support/260915-kanvy-cli.mjs <resource> list [--boardId=b1]
//   node ctx/support/260915-kanvy-cli.mjs <resource> get <id>
//   node ctx/support/260915-kanvy-cli.mjs <resource> create <json|@file.json>
//   node ctx/support/260915-kanvy-cli.mjs <resource> update <id> <json|@file.json>
//   node ctx/support/260915-kanvy-cli.mjs <resource> delete <id>
//
// <resource> is one of: boards | nodes | edges | images
// Base URL defaults to http://localhost:3000, override with KANVY_API env var.
//
// Examples:
//   node ctx/support/260915-kanvy-cli.mjs nodes list --boardId=b1
//   node ctx/support/260915-kanvy-cli.mjs nodes get n1
//   node ctx/support/260915-kanvy-cli.mjs nodes create '{"boardId":"b1","type":"container","kind":null,"x":0,"y":0,"w":200,"h":200,"color":"gray","pattern":"none","createdAt":"2026-09-15T00:00:00.000Z","updatedAt":"2026-09-15T00:00:00.000Z"}'
//   node ctx/support/260915-kanvy-cli.mjs nodes update n1 '{"content":"edited"}'
//   node ctx/support/260915-kanvy-cli.mjs nodes delete n1

import { readFileSync } from 'node:fs'

const BASE_URL = process.env.KANVY_API ?? 'http://localhost:3000'
const RESOURCES = ['boards', 'nodes', 'edges', 'images']

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function parseJsonArg(arg) {
  if (arg === undefined) fail('missing JSON argument')
  const raw = arg.startsWith('@') ? readFileSync(arg.slice(1), 'utf8') : arg
  try {
    return JSON.parse(raw)
  } catch (err) {
    fail(`invalid JSON argument: ${err.message}`)
  }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const parsed = text ? JSON.parse(text) : null
  if (!res.ok) {
    fail(`${method} ${path} -> ${res.status} ${res.statusText}\n${text}`)
  }
  return parsed
}

async function main() {
  const [resource, action, ...rest] = process.argv.slice(2)

  if (!resource || !action) {
    console.error(
      'usage: kanvy-cli.mjs <boards|nodes|edges|images> <list|get|create|update|delete> [args]',
    )
    process.exit(1)
  }
  if (!RESOURCES.includes(resource)) {
    fail(`unknown resource "${resource}" — expected one of ${RESOURCES.join(', ')}`)
  }

  let result
  switch (action) {
    case 'list': {
      const filterArg = rest.find((a) => a.startsWith('--boardId='))
      const query = filterArg ? `?boardId=${filterArg.split('=')[1]}` : ''
      result = await request('GET', `/${resource}${query}`)
      break
    }
    case 'get': {
      const [id] = rest
      if (!id) fail('get requires an id')
      result = await request('GET', `/${resource}/${id}`)
      break
    }
    case 'create': {
      const body = parseJsonArg(rest[0])
      result = await request('POST', `/${resource}`, body)
      break
    }
    case 'update': {
      const [id, jsonArg] = rest
      if (!id) fail('update requires an id')
      const body = parseJsonArg(jsonArg)
      result = await request('PATCH', `/${resource}/${id}`, body)
      break
    }
    case 'delete': {
      const [id] = rest
      if (!id) fail('delete requires an id')
      result = await request('DELETE', `/${resource}/${id}`)
      break
    }
    default:
      fail(`unknown action "${action}" — expected one of list, get, create, update, delete`)
  }

  console.log(JSON.stringify(result, null, 2))
}

main()
