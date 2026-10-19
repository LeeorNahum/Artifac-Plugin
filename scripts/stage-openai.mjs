#!/usr/bin/env node
// Stages the folder OpenAI's plugin portal takes as a ZIP.
//
// The portal reads the same Agent Plugins package this repository publishes,
// with the skill materialized from its submodule like every release, and one
// difference it requires and the Agent Plugins MCP schema does not allow: how
// the server's OAuth client is registered, declared on the server entry under
// extensions.com.openai. So the staged mcp.json carries that one addition and
// the repository's own mcp.json stays valid against its schema.

import { readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { stagePackage } from "./stage-release.mjs"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// What the portal reads. The Claude Code and Gemini CLI adapters and the setup
// notes are for other hosts.
const otherHostFiles = new Set(["README.md", "SETUP.md", "gemini-extension.json"])
const portalFiles = (files) => files.filter((path) => !path.startsWith(".") && !otherHostFiles.has(path))

// The listing links reviewers open. Each must answer before a package goes to review.
const listingLinks = ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]

async function answers(url) {
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15_000) })
    await response.body?.cancel()
    return response.ok
  } catch {
    return false
  }
}

export async function stageOpenAi({ root = scriptRoot, output, checkLink = answers }) {
  const plugin = JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"))
  const openai = plugin.extensions?.["com.openai"]
  const demo = openai?.review?.demo_recording_url
  if (typeof demo !== "string" || !demo.startsWith("https://")) {
    throw new Error("OpenAI's MCP review needs extensions.com.openai.review.demo_recording_url in plugin.json: record the demo against production and add its https link first")
  }
  const broken = []
  for (const field of listingLinks) {
    const url = openai?.interface?.[field]
    if (!(await checkLink(url))) broken.push(`${field} (${url})`)
  }
  if (broken.length > 0) throw new Error(`These listing links do not answer yet: ${broken.join(", ")}`)

  const staged = await stagePackage({ root, output, select: portalFiles })
  const mcpPath = resolve(staged.output, "mcp.json")
  const mcp = JSON.parse(await readFile(mcpPath, "utf8"))
  for (const server of Object.values(mcp.mcpServers)) {
    server.extensions = { "com.openai": { auth: { type: "oauth", client: { mode: "dcr" } } } }
  }
  await writeFile(mcpPath, `${JSON.stringify(mcp, null, 2)}\n`)
  return staged
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf("--output")
  const output = flag === -1 ? undefined : process.argv[flag + 1]
  if (!output) {
    console.error("Usage: node scripts/stage-openai.mjs --output <directory>")
    process.exit(1)
  }
  try {
    console.log(JSON.stringify(await stageOpenAi({ output: resolve(output) })))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
