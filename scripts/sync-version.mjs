#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function readPointer(value, pointer) {
  return pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, part) => current?.[part], value)
}

function writePointer(value, pointer, replacement) {
  const parts = pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
  const key = parts.pop()
  const parent = parts.reduce((current, part) => current?.[part], value)

  if (parent === undefined || key === undefined || !(key in parent)) {
    throw new Error(`JSON pointer ${pointer} does not exist`)
  }

  parent[key] = replacement
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}

function resolveInside(root, path) {
  const target = resolve(root, path)
  const relation = relative(root, target)
  if (relation.startsWith("..") || isAbsolute(relation)) {
    throw new Error(`Version surface escapes the repository: ${path}`)
  }
  return target
}

export async function inspectVersions(root = scriptRoot) {
  const contractPath = resolveInside(root, "scripts/release-contract.json")
  const contract = await readJson(contractPath)
  const sourcePath = resolveInside(root, contract.version.source.path)
  const sourceDocument = await readJson(sourcePath)
  const version = readPointer(sourceDocument, contract.version.source.jsonPointer)
  const surfaces = []

  // The bundled skill keeps its own metadata.version in its own repository,
  // so every surface here is a JSON manifest.
  for (const dependent of contract.version.dependents) {
    if (!dependent.jsonPointer) throw new Error(`Unsupported version surface in ${dependent.path}`)
    const document = await readJson(resolveInside(root, dependent.path))
    surfaces.push({
      ...dependent,
      value: readPointer(document, dependent.jsonPointer),
    })
  }

  return { contract, version, surfaces }
}

export async function synchronizeVersions({ root = scriptRoot, write = false } = {}) {
  const inspection = await inspectVersions(root)
  const changed = inspection.surfaces
    .filter((surface) => surface.value !== inspection.version)
    .map((surface) => surface.path)

  if (!write || changed.length === 0) {
    return { ...inspection, changed }
  }

  for (const surface of inspection.surfaces.filter((item) => item.value !== inspection.version)) {
    const path = resolveInside(root, surface.path)
    const document = await readJson(path)
    writePointer(document, surface.jsonPointer, inspection.version)
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`)
  }

  return { ...(await inspectVersions(root)), changed }
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/sync-version.mjs [--check | --write]\n\n`)
  process.stdout.write(`Keep every release version aligned with plugin.json.\n\n`)
  process.stdout.write(`Options:\n`)
  process.stdout.write(`  --check  Report drift and fail when any dependent differs (default)\n`)
  process.stdout.write(`  --write  Copy plugin.json's version to every declared dependent\n`)
  process.stdout.write(`  --help   Show this help\n`)
}

async function main() {
  const option = process.argv[2] ?? "--check"
  if (option === "--help") {
    printHelp()
    return
  }
  if (!new Set(["--check", "--write"]).has(option) || process.argv.length > 3) {
    printHelp()
    process.exitCode = 2
    return
  }

  const result = await synchronizeVersions({ write: option === "--write" })
  const output = {
    ok: option === "--write" || result.changed.length === 0,
    version: result.version,
    changed: result.changed,
  }
  process.stdout.write(`${JSON.stringify(output)}\n`)
  if (!output.ok) process.exitCode = 1
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
