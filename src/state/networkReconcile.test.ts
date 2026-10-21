import { describe, expect, it } from 'vitest'
import {
  nodeRenderKey,
  reconcileNetworkEntityIdAtom,
  resolveReconciledNodeId,
} from './networkReconcile'

describe('nodeRenderKey', () => {
  it('is the id itself for a node that was never reconciled', () => {
    expect(nodeRenderKey('never-reconciled')).toBe('never-reconciled')
  })

  it('keeps the first-rendered id as the key after a node id is reconciled', () => {
    reconcileNetworkEntityIdAtom('node', 'local-a', 'server-a')
    expect(resolveReconciledNodeId('local-a')).toBe('server-a')
    expect(nodeRenderKey('server-a')).toBe('local-a')
  })

  it('follows a chain of reconciliations back to the original key', () => {
    reconcileNetworkEntityIdAtom('node', 'local-b', 'mid-b')
    reconcileNetworkEntityIdAtom('node', 'mid-b', 'server-b')
    expect(nodeRenderKey('server-b')).toBe('local-b')
  })

  it('ignores board/edge reconciliations', () => {
    reconcileNetworkEntityIdAtom('board', 'local-c', 'server-c')
    expect(nodeRenderKey('server-c')).toBe('server-c')
  })
})
