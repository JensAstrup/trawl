/**
 * Minimal HTTPS JSON fetch helper shared by ecosystem registry clients.
 * Uses Node's https module (no fetch/axios) to keep the bundle small.
 */

import * as http from 'http'
import * as https from 'https'

import { version } from '../../package.json'

import { HttpStatusCode } from './types'


const REQUEST_TIMEOUT_MS = 10_000

export interface FetchJsonOptions {
  /** Treat a 404 as a distinct "not found" error message */
  notFoundLabel?: string;
}

/**
 * GET a URL and parse the response body as JSON.
 * Rejects on non-2xx status, timeout, network error, or invalid JSON.
 */
export function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': `trawl-vscode/${version}`,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res: http.IncomingMessage) => {
        if (res.statusCode === HttpStatusCode.NOT_FOUND) {
          reject(new Error(options.notFoundLabel ?? `Not found: ${url}`))
          return
        }

        if (res.statusCode && res.statusCode >= HttpStatusCode.BAD_REQUEST) {
          reject(new Error(`Request returned ${res.statusCode} for ${url}`))
          return
        }

        let data = ''
        res.on('data', (chunk: Buffer | string) => {
          data += chunk.toString()
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as T)
          }
          catch {
            reject(new Error(`Failed to parse response for ${url}`))
          }
        })
      }
    )

    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error(`Timeout fetching ${url}`))
    })
  })
}
