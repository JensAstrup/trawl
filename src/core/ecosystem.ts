/**
 * Ecosystem registry: the list of supported ecosystems and lookup helpers
 * used by the orchestrator and providers to route a document to its owner.
 */

import type * as vscode from 'vscode'

import { npmEcosystem } from '../npm'

import { Ecosystem } from './types'


export const ECOSYSTEMS: Ecosystem[] = [npmEcosystem]

export function ecosystemForDocument(document: vscode.TextDocument): Ecosystem | undefined {
  return ECOSYSTEMS.find((ecosystem) => ecosystem.matches(document))
}
