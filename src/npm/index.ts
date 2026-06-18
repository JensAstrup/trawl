/**
 * npm ecosystem: assembles the package.json parser, npm registry client,
 * semver analysis, and npm presentation into a single Ecosystem.
 */

import { Ecosystem } from '../core/types'

import {
  parseDependencies,
  getDependencyAtPosition,
  getDependencyByName,
  isPackageJson,
} from './parser'
import { buildCompletionItems, hoverLinks, packageUrl, shouldSkip } from './presentation'
import { npmRegistry } from './registry'
import { analyzeVersion, suggestVersionUpdate } from './semver-utils'


export const npmEcosystem: Ecosystem = {
  id: 'npm',
  registryName: 'npm',
  documentSelector: { language: 'json', pattern: '**/package.json' },
  completionTriggerCharacters: ['"', '.', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '^', '~'],
  workspaceGlob: '**/package.json',
  workspaceExcludeGlob: '**/node_modules/**',
  showGroup: true,

  matches: isPackageJson,

  parseDependencies,
  getDependencyAtVersion: getDependencyAtPosition,
  getDependencyAtName: getDependencyByName,

  getPackageInfo: npmRegistry.getPackageInfo,
  prefetchPackages: npmRegistry.prefetchPackages,
  scheduleBackgroundRefresh: npmRegistry.scheduleBackgroundRefresh,
  clearCache: npmRegistry.clearCache,
  setCacheTTL: npmRegistry.setCacheTTL,

  analyzeVersion,
  suggestVersionUpdate,
  shouldSkip,

  packageUrl,
  buildCompletionItems,
  hoverLinks,
}
