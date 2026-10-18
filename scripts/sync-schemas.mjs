#!/usr/bin/env node

import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const canonicalSources = [
  {
    id: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    path: "agent-plugins/plugin.schema.json",
    url: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  },
  {
    id: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    path: "agent-plugins/mcp.schema.json",
    url: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  },
  {
    id: "https://json.schemastore.org/claude-code-plugin-manifest.json",
    path: "claude/plugin.schema.json",
    url: "https://json.schemastore.org/claude-code-plugin-manifest.json",
  },
  {
    id: "https://json.schemastore.org/claude-code-marketplace.json",
    path: "claude/marketplace.schema.json",
    url: "https://json.schemastore.org/claude-code-marketplace.json",
  },
]

function digest(content) {
  return createHash("sha256").update(content).digest("hex")
}

export async function refreshSchemas(root = scriptRoot) {
  const sourcesPath = resolve(root, "schemas/sources.json")
  const generated = []
  for (const source of canonicalSources) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`Failed to fetch ${source.url}: HTTP ${response.status}`)
    const document = JSON.parse(await response.text())
    if (document.$id !== source.id) {
      throw new Error(`Schema from ${source.url} declares unexpected $id ${JSON.stringify(document.$id)}`)
    }
    const content = `${JSON.stringify(document, null, 2)}\n`
    generated.push({ content, source })
  }

  const sources = []
  for (const { content, source } of generated) {
    const path = resolve(root, "schemas", source.path)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
    sources.push({ ...source, sha256: digest(content) })
  }
  await writeFile(sourcesPath, `${JSON.stringify({ sources }, null, 2)}\n`)
  return sources
}

export async function checkSchemas(root = scriptRoot) {
  const sourcesPath = resolve(root, "schemas/sources.json")
  const manifest = JSON.parse(await readFile(sourcesPath, "utf8"))
  const errors = []
  if (JSON.stringify(manifest.sources.map(({ id, path, url }) => ({ id, path, url }))) !== JSON.stringify(canonicalSources)) {
    errors.push("schemas/sources.json does not list the canonical schema set")
  }
  for (const source of canonicalSources) {
    const recorded = manifest.sources.find((item) => item.path === source.path)
    const content = await readFile(resolve(root, "schemas", source.path), "utf8")
    if (digest(content) !== recorded?.sha256) errors.push(`${source.path} does not match its recorded SHA-256`)
    const document = JSON.parse(content)
    if (document.$id !== source.id) errors.push(`${source.path} declares an unexpected $id`)
  }
  return errors
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/sync-schemas.mjs [--check | --refresh]\n\n`)
  process.stdout.write(`Verify vendored schemas locally, or explicitly refresh them from canonical URLs.\n\n`)
  process.stdout.write(`Options:\n`)
  process.stdout.write(`  --check    Verify recorded local hashes without network access (default)\n`)
  process.stdout.write(`  --refresh  Fetch, normalize, and record the canonical schemas\n`)
  process.stdout.write(`  --help     Show this help\n`)
}

async function main() {
  const option = process.argv[2] ?? "--check"
  if (option === "--help") {
    printHelp()
    return
  }
  if (!new Set(["--check", "--refresh"]).has(option) || process.argv.length > 3) {
    printHelp()
    process.exitCode = 2
    return
  }

  if (option === "--refresh") {
    const sources = await refreshSchemas()
    process.stdout.write(`${JSON.stringify({ ok: true, refreshed: sources.map(({ path }) => path) })}\n`)
    return
  }

  const errors = await checkSchemas()
  process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, errors })}\n`)
  if (errors.length > 0) process.exitCode = 1
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
