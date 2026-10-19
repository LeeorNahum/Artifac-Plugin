#!/usr/bin/env node

import Ajv from "ajv"
import Ajv2020 from "ajv/dist/2020.js"
import addFormats from "ajv-formats"
import { isMap } from "yaml"
import { access, readdir, readFile } from "node:fs/promises"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"
import { parseSkillFrontmatter } from "./frontmatter.mjs"
import { isGitCheckout, readSkill, relativeLinks, skillFiles, submoduleState } from "./skill.mjs"
import { checkSchemas } from "./sync-schemas.mjs"
import { inspectVersions } from "./sync-version.mjs"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const pluginName = "artifac"
const serverUrl = "https://mcp.artif.ac/mcp"

// Hosts install from a Git clone, and some copy the plugin without fetching
// submodules, so the marketplace entry installs from the dist branch, where
// the release workflow commits the package with the skill as ordinary files.
// Claude Code, the Claude app, Codex, Cursor, and VS Code all read this entry.
const distSource = {
  source: "url",
  url: "https://github.com/LeeorNahum/Artifac-Plugin.git",
  ref: "dist",
}

// The Artifac MCP server's tools, as packages/domain/src/mcp-tools.ts in
// Artifac-Web defines them. The README names each one, and the OpenAI review
// cases may name only these.
const publicTools = [
  "list_workspaces",
  "list_artifacts",
  "read_artifact",
  "create_artifact",
  "update_artifact",
  "edit_artifact_file",
  "delete_artifact_files",
  "delete_artifact",
]

const expectedVersionContract = {
  source: {
    path: "plugin.json",
    jsonPointer: "/version",
  },
  dependents: [
    {
      path: ".claude-plugin/marketplace.json",
      jsonPointer: "/plugins/0/version",
    },
    {
      path: ".claude-plugin/plugin.json",
      jsonPointer: "/version",
    },
    {
      path: "gemini-extension.json",
      jsonPointer: "/version",
    },
  ],
}

const expectedSkillContract = {
  path: "skills/artifac",
  name: "artifac",
  include: ["LICENSE", "SKILL.md", "assets", "references", "scripts"],
}

// The top-level keys the Agent Skills specification defines for SKILL.md.
const skillFrontmatterKeys = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"])

function compareText(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

async function readJson(root, path, errors) {
  try {
    return JSON.parse(await readFile(resolve(root, path), "utf8"))
  } catch (error) {
    errors.push(`${path} is not valid JSON: ${error.message}`)
    return undefined
  }
}

async function walkFiles(root, path = root) {
  const entries = await readdir(path, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) files.push(...await walkFiles(root, child))
    if (entry.isFile()) files.push(relative(root, child).split(sep).join("/"))
  }
  return files
}

function addEqual(errors, label, actual, expected) {
  if (actual !== expected) errors.push(`${label} must be ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const actual = Object.keys(value).sort(compareText)
  return isDeepStrictEqual(actual, [...expected].sort(compareText))
}

async function validateWithSchema(root, label, document, schemaPath, errors) {
  if (!document) return
  const schema = JSON.parse(await readFile(resolve(root, schemaPath), "utf8"))
  const options = { allErrors: true, strict: false }
  const ajv = schema.$schema?.includes("2020-12") ? new Ajv2020(options) : new Ajv(options)
  addFormats(ajv)
  const validate = ajv.compile(schema)
  if (validate(document)) return
  for (const error of validate.errors ?? []) {
    errors.push(`${label}${error.instancePath || "/"}: ${error.message}`)
  }
}

function rejectCredentialConfiguration(label, server, errors) {
  if (server?.headers !== undefined) errors.push(`${label} must not declare request headers or credentials`)
  try {
    const url = new URL(server?.url)
    if (url.username || url.password) errors.push(`${label} URL must not contain credentials`)
  } catch {
    errors.push(`${label} URL must be an absolute URL`)
  }
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function checkHttpsUrl(errors, label, value) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || url.username || url.password) errors.push(`${label} must be an https URL without credentials`)
  } catch {
    errors.push(`${label} must be an https URL`)
  }
}

// OpenAI's plugin portal reads the listing and review cases from
// extensions.com.openai and states these limits for an MCP review.
function validateOpenAiListing(openai, errors) {
  const listing = openai?.interface
  if (!listing) {
    errors.push("plugin.json extensions.com.openai.interface is required")
    return
  }
  for (const [field, max] of [["displayName", 30], ["shortDescription", 30], ["longDescription", 4000], ["developerName", 80]]) {
    if (typeof listing[field] !== "string" || listing[field].length === 0) errors.push(`OpenAI interface.${field} is required`)
    else if (listing[field].length > max) errors.push(`OpenAI interface.${field} is longer than ${max} characters`)
  }
  for (const field of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    checkHttpsUrl(errors, `OpenAI interface.${field}`, listing[field])
  }
  const prompts = listing.defaultPrompt ?? []
  if (!Array.isArray(prompts) || prompts.length > 3) errors.push("OpenAI interface.defaultPrompt holds at most three prompts")
  else {
    if (new Set(prompts).size !== prompts.length) errors.push("OpenAI interface.defaultPrompt entries must be unique")
    for (const prompt of prompts) if (typeof prompt !== "string" || prompt.length > 128) errors.push("OpenAI interface.defaultPrompt entries are at most 128 characters")
  }

  const cases = openai?.review?.test_cases
  if (!cases) {
    errors.push("plugin.json extensions.com.openai.review.test_cases is required")
    return
  }
  if (!Array.isArray(cases.positive) || cases.positive.length !== 5) errors.push("OpenAI review needs exactly five positive test cases")
  if (!Array.isArray(cases.negative) || cases.negative.length !== 3) errors.push("OpenAI review needs exactly three negative test cases")
  for (const [index, item] of (cases.positive ?? []).entries()) {
    for (const field of ["description", "prompt", "tools_triggered", "expected_behavior"]) {
      if (typeof item?.[field] !== "string" || item[field].length === 0) errors.push(`OpenAI positive case ${index + 1} needs ${field}`)
    }
    for (const tool of String(item?.tools_triggered ?? "").split(",").map((name) => name.trim()).filter(Boolean)) {
      if (!publicTools.includes(tool)) errors.push(`OpenAI positive case ${index + 1} names an unknown tool ${JSON.stringify(tool)}`)
    }
  }
  for (const [index, item] of (cases.negative ?? []).entries()) {
    for (const field of ["description", "prompt"]) {
      if (typeof item?.[field] !== "string" || item[field].length === 0) errors.push(`OpenAI negative case ${index + 1} needs ${field}`)
    }
  }
}

// Gemini CLI reads gemini-extension.json and reaches a streamable HTTP server
// through httpUrl. It finds the skill in skills/ without a declaration, so this
// package declares only name, version, description, and the one server.
function validateGeminiExtension(gemini, plugin, errors) {
  if (!gemini) return
  if (!hasExactKeys(gemini, ["name", "version", "description", "mcpServers"])) {
    errors.push("gemini-extension.json must declare exactly name, version, description, and mcpServers")
  }
  addEqual(errors, "Gemini extension name", gemini.name, plugin?.name)
  addEqual(errors, "Gemini extension description", gemini.description, plugin?.description)
  if (!isDeepStrictEqual(Object.keys(gemini.mcpServers ?? {}), [pluginName])) {
    errors.push(`gemini-extension.json must declare exactly one server, ${pluginName}`)
  }
  const server = gemini.mcpServers?.[pluginName]
  if (!hasExactKeys(server, ["httpUrl"])) errors.push(`gemini-extension.json ${pluginName} server must declare only httpUrl`)
  addEqual(errors, "gemini-extension.json server URL", server?.httpUrl, serverUrl)
}

async function validateSkill(root, skill, errors) {
  const directory = resolve(root, skill.path)
  if (!(await exists(resolve(directory, "SKILL.md")))) {
    errors.push(`${skill.path}/SKILL.md is missing. Initialize the submodule with git submodule update --init -- ${skill.path}`)
    return []
  }
  const content = await readSkill(root, skill)
  let parsed
  try {
    parsed = parseSkillFrontmatter(content)
  } catch (error) {
    errors.push(`${skill.path}/SKILL.md: ${error.message}`)
    return []
  }
  const keys = isMap(parsed.document.contents) ? parsed.document.contents.items.map((pair) => pair.key?.value) : []
  for (const key of keys) {
    if (!skillFrontmatterKeys.has(key)) errors.push(`${skill.path}/SKILL.md frontmatter has a key outside the Agent Skills specification: ${key}`)
  }
  const metadata = parsed.data
  addEqual(errors, "Skill name", metadata?.name, skill.name)
  addEqual(errors, "Skill directory", skill.path.split("/").pop(), metadata?.name)
  if (typeof metadata?.description !== "string" || metadata.description.length === 0) errors.push("Skill description must be a non-empty string")
  else if (metadata.description.length > 1024) errors.push("Skill description exceeds 1024 characters")
  if (!/^\d+\.\d+\.\d+$/.test(metadata?.metadata?.version ?? "")) errors.push("Skill metadata.version must be a semantic version string")

  const files = skillFiles(root, skill)
  for (const target of relativeLinks(parsed.body)) {
    const path = `${skill.path}/${target.replace(/^\.\//, "")}`
    if (!files.includes(path)) errors.push(`${skill.path}/SKILL.md links to ${target}, which the package does not include`)
  }
  if (isGitCheckout(root)) errors.push(...submoduleState(root, skill.path).errors)
  return files
}

export async function validatePackage(root = scriptRoot) {
  const errors = []
  const plugin = await readJson(root, "plugin.json", errors)
  const mcp = await readJson(root, "mcp.json", errors)
  const claudePlugin = await readJson(root, ".claude-plugin/plugin.json", errors)
  const claudeMarketplace = await readJson(root, ".claude-plugin/marketplace.json", errors)
  const claudeMcp = await readJson(root, ".mcp.json", errors)
  const gemini = await readJson(root, "gemini-extension.json", errors)
  const contract = await readJson(root, "scripts/release-contract.json", errors)
  const version = plugin?.version

  try {
    const schemaErrors = await checkSchemas(root)
    errors.push(...schemaErrors.map((error) => `Vendored schema error: ${error}`))
  } catch (error) {
    errors.push(`Vendored schemas are invalid: ${error.message}`)
  }

  await validateWithSchema(root, "plugin.json", plugin, "schemas/agent-plugins/plugin.schema.json", errors)
  await validateWithSchema(root, "mcp.json", mcp, "schemas/agent-plugins/mcp.schema.json", errors)
  await validateWithSchema(root, ".claude-plugin/plugin.json", claudePlugin, "schemas/claude/plugin.schema.json", errors)
  await validateWithSchema(root, ".claude-plugin/marketplace.json", claudeMarketplace, "schemas/claude/marketplace.schema.json", errors)
  if (claudeMcp) {
    await validateWithSchema(
      root,
      ".mcp.json",
      { $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", ...claudeMcp },
      "schemas/agent-plugins/mcp.schema.json",
      errors,
    )
  }

  addEqual(errors, "plugin.json $schema", plugin?.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json")
  addEqual(errors, "plugin.json name", plugin?.name, pluginName)
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) errors.push(`plugin.json version must be semantic, received ${JSON.stringify(version)}`)
  addEqual(errors, "mcp.json $schema", mcp?.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json")

  const servers = Object.keys(mcp?.mcpServers ?? {})
  if (!isDeepStrictEqual(servers, [pluginName])) errors.push(`mcp.json must declare exactly one server, ${pluginName}`)
  if (!isDeepStrictEqual(Object.keys(claudeMcp?.mcpServers ?? {}), [pluginName])) errors.push(`.mcp.json must declare exactly one server, ${pluginName}`)
  const canonicalServer = mcp?.mcpServers?.[pluginName]
  addEqual(errors, "mcp.json server type", canonicalServer?.type, "streamable-http")
  addEqual(errors, "mcp.json server URL", canonicalServer?.url, serverUrl)
  addEqual(errors, ".mcp.json server type", claudeMcp?.mcpServers?.[pluginName]?.type, canonicalServer?.type)
  addEqual(errors, ".mcp.json server URL", claudeMcp?.mcpServers?.[pluginName]?.url, canonicalServer?.url)
  rejectCredentialConfiguration(`mcp.json ${pluginName} server`, canonicalServer, errors)
  rejectCredentialConfiguration(`.mcp.json ${pluginName} server`, claudeMcp?.mcpServers?.[pluginName], errors)

  if (claudePlugin?.hooks !== undefined) errors.push(".claude-plugin/plugin.json must not declare hooks")
  if (plugin?.hooks !== undefined) errors.push("plugin.json must not declare hooks")
  // Hosts load a hooks file from these paths with no declaration at all.
  for (const path of ["hooks", ".claude-plugin/hooks.json"]) {
    if (await exists(resolve(root, path))) errors.push(`${path} must not exist: the plugin runs no hooks`)
  }

  addEqual(errors, "Claude plugin name", claudePlugin?.name, plugin?.name)
  addEqual(errors, "Claude plugin description", claudePlugin?.description, plugin?.description)
  addEqual(errors, "Claude marketplace name", claudeMarketplace?.name, plugin?.name)
  if (!isDeepStrictEqual(claudeMarketplace?.plugins?.[0]?.source, distSource)) {
    errors.push(`Claude marketplace source must install from the generated dist branch, ${JSON.stringify(distSource)}`)
  }
  addEqual(errors, "Claude marketplace plugin name", claudeMarketplace?.plugins?.[0]?.name, plugin?.name)
  // Before install, Claude Code shows only the entry's own fields for a source outside the marketplace.
  addEqual(errors, "Claude marketplace displayName", claudeMarketplace?.plugins?.[0]?.displayName, claudePlugin?.displayName)
  addEqual(errors, "Claude plugin displayName", claudePlugin?.displayName, plugin?.extensions?.["com.openai"]?.interface?.displayName)
  addEqual(errors, "Claude marketplace description", claudeMarketplace?.plugins?.[0]?.description, plugin?.description)
  if ((claudeMarketplace?.plugins?.length ?? 0) !== 1) errors.push(".claude-plugin/marketplace.json must list exactly one plugin")

  validateOpenAiListing(plugin?.extensions?.["com.openai"], errors)
  validateGeminiExtension(gemini, plugin, errors)

  if (!hasExactKeys(contract, ["version", "skill", "publishedFiles"])) {
    errors.push("release-contract.json contains missing or unknown top-level fields")
  }
  if (!isDeepStrictEqual(contract?.version, expectedVersionContract)) {
    errors.push("release-contract.json must declare every supported version surface")
  }
  if (!isDeepStrictEqual(contract?.skill, expectedSkillContract)) {
    errors.push("release-contract.json must declare the bundled skill at skills/artifac")
  }

  try {
    const inspection = await inspectVersions(root)
    for (const surface of inspection.surfaces) {
      addEqual(errors, `${surface.path} version`, surface.value, inspection.version)
    }
  } catch (error) {
    errors.push(`Version contract is invalid: ${error.message}`)
  }

  const skill = contract?.skill ?? expectedSkillContract
  const packagedSkillFiles = await validateSkill(root, skill, errors)

  const readme = await readFile(resolve(root, "README.md"), "utf8")
  for (const tool of publicTools) {
    if (!readme.includes(`\`${tool}\``)) errors.push(`README.md is missing the ${tool} tool`)
  }
  const setup = await readFile(resolve(root, "SETUP.md"), "utf8")

  const published = Array.isArray(contract?.publishedFiles) ? contract.publishedFiles : []
  if (!Array.isArray(contract?.publishedFiles)) {
    errors.push("scripts/release-contract.json must declare publishedFiles")
  } else {
    const sorted = [...published].sort(compareText)
    if (new Set(published).size !== published.length) errors.push("publishedFiles contains duplicates")
    if (published.some((path) => path.startsWith("/") || path.includes("..") || path.includes("\\"))) {
      errors.push("publishedFiles must contain safe repository-relative POSIX paths")
    }
    if (JSON.stringify(published) !== JSON.stringify(sorted)) errors.push("publishedFiles must be sorted")
    if (published.some((path) => path.startsWith("skills/"))) {
      errors.push("publishedFiles must not list skill files: the release takes them from the skill submodule")
    }

    const claudeFiles = (await walkFiles(resolve(root, ".claude-plugin"))).map((path) => `.claude-plugin/${path}`)
    const assetFiles = (await walkFiles(resolve(root, "assets"))).map((path) => `assets/${path}`)
    const requiredFiles = [".mcp.json", "LICENSE", "README.md", "SETUP.md", "gemini-extension.json", "mcp.json", "plugin.json", ...assetFiles, ...claudeFiles]
      .sort(compareText)
    if (JSON.stringify(published) !== JSON.stringify(requiredFiles)) {
      errors.push("publishedFiles must exactly match every user runtime component outside the skill")
    }
    for (const path of published) {
      if (!(await exists(resolve(root, path)))) errors.push(`Published file does not exist: ${path}`)
    }
  }

  const prose = [readme, setup]
  for (const path of packagedSkillFiles.filter((file) => /\.(md|html)$/.test(file))) {
    prose.push(await readFile(resolve(root, path), "utf8"))
  }
  if (prose.some((content) => /[–—]/.test(content))) errors.push("Runtime prose contains an em or en dash")

  return {
    ok: errors.length === 0,
    version,
    publishedFiles: published,
    skillFiles: packagedSkillFiles,
    errors,
  }
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/validate.mjs\n\n`)
  process.stdout.write(`Validate plugin manifests, endpoint parity, the OpenAI listing, the Gemini extension, the skill submodule, and release inventory.\n`)
}

async function main() {
  if (process.argv[2] === "--help") {
    printHelp()
    return
  }
  if (process.argv.length > 2) {
    printHelp()
    process.exitCode = 2
    return
  }

  const result = await validatePackage()
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 1
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
