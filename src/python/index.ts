/**
 * Python ecosystem: assembles the requirements.txt parser, PyPI registry
 * client, PEP 440 analysis, and Python presentation into a single Ecosystem.
 */

import { Ecosystem } from '../core/types'

import {
  parseDependencies,
  getDependencyAtVersion,
  getDependencyAtName,
  isRequirementsTxt,
} from './parser'
import { analyzeVersion, suggestVersionUpdate } from './pep440-utils'
import { buildCompletionItems, hoverLinks, packageUrl, shouldSkip } from './presentation'
import { pythonRegistry } from './registry'


export const pythonEcosystem: Ecosystem = {
  id: 'python',
  registryName: 'PyPI',
  documentSelector: { pattern: '**/requirements*.txt' },
  completionTriggerCharacters: ['=', '~', '>', '<', '.', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  workspaceGlob: '**/requirements*.txt',
  workspaceExcludeGlob: null,
  showGroup: false,

  matches: isRequirementsTxt,

  parseDependencies,
  getDependencyAtVersion,
  getDependencyAtName,

  getPackageInfo: pythonRegistry.getPackageInfo,
  prefetchPackages: pythonRegistry.prefetchPackages,
  scheduleBackgroundRefresh: pythonRegistry.scheduleBackgroundRefresh,
  clearCache: pythonRegistry.clearCache,
  setCacheTTL: pythonRegistry.setCacheTTL,

  analyzeVersion,
  suggestVersionUpdate,
  shouldSkip,

  packageUrl,
  buildCompletionItems,
  hoverLinks,
}
