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

// What the portal reads. The Claude Code adapter and the setup notes are for
// other hosts.
const portalFiles = (files) => files.filter((path) => !path.startsWith(".") && path !== "README.md" && path !== "SETUP.md")

export async function stageOpenAi({ root = scriptRoot, output }) {
  const plugin = JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"))
  const demo = plugin.extensions?.["com.openai"]?.review?.demo_recording_url
  if (typeof demo !== "string" || !demo.startsWith("https://")) {
    throw new Error("OpenAI's MCP review needs extensions.com.openai.review.demo_recording_url in plugin.json: record the demo against production and add its https link first")
  }
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
