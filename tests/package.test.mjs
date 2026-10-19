import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, relative, resolve, sep } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { parseSkillFrontmatter } from "../scripts/frontmatter.mjs"
import { distCommit } from "../scripts/dist-commit.mjs"
import { relativeLinks } from "../scripts/skill.mjs"
import { stageOpenAi } from "../scripts/stage-openai.mjs"
import { stageRelease } from "../scripts/stage-release.mjs"
import { synchronizeVersions } from "../scripts/sync-version.mjs"
import { validatePackage } from "../scripts/validate.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const skillPath = "skills/artifac"

function compareText(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

async function walk(path, base = path) {
  const entries = await readdir(path, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) files.push(...await walk(child, base))
    if (entry.isFile()) files.push(relative(base, child).split(sep).join("/"))
  }
  return files.sort(compareText)
}

async function temporary(context, prefix) {
  const path = await mkdtemp(resolve(tmpdir(), prefix))
  context.after(() => rm(path, { recursive: true, force: true }))
  return path
}

// A copy of the working tree without Git metadata, so validation checks the
// files themselves and skips the submodule's Git state.
async function copyCandidate(context) {
  const candidate = resolve(await temporary(context, "artifac-plugin-test-"), "candidate")
  await cp(root, candidate, {
    recursive: true,
    filter: (path) => !path.includes(`${sep}.git${sep}`)
      && !path.endsWith(`${sep}.git`)
      && !path.includes(`${sep}node_modules${sep}`)
      && !path.endsWith(`${sep}node_modules`)
      && !path.includes(`${sep}dist${sep}`)
      && !path.endsWith(`${sep}dist`),
  })
  return candidate
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

// A real clone of the committed repository, with the skill submodule
// initialized from this checkout's copy so the test needs no network.
async function cloneCandidate(context, { initialize = true } = {}) {
  const clone = resolve(await temporary(context, "artifac-plugin-clone-"), "clone")
  git(root, ["clone", "--quiet", "--no-hardlinks", root, clone])
  if (initialize) {
    git(clone, ["config", `submodule.${skillPath}.url`, resolve(root, skillPath)])
    git(clone, ["-c", "protocol.file.allow=always", "submodule", "update", "--quiet", "--init", "--", skillPath])
  }
  return clone
}

async function editJson(path, change) {
  const document = JSON.parse(await readFile(path, "utf8"))
  change(document)
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`)
}

test("the candidate package satisfies its release contract", async () => {
  const result = await validatePackage(root)
  const plugin = JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"))
  assert.deepEqual(result.errors, [])
  assert.equal(result.ok, true)
  assert.equal(result.version, plugin.version)
  assert.ok(result.skillFiles.includes(`${skillPath}/SKILL.md`))
})

test("version drift fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, ".claude-plugin/plugin.json"), (manifest) => { manifest.version = "0.0.0" })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes(".claude-plugin/plugin.json version")))
})

test("version generation repairs declared dependent surfaces", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, ".claude-plugin/plugin.json"), (manifest) => { manifest.version = "0.0.0" })

  const sync = await synchronizeVersions({ root: candidate, write: true })
  const result = await validatePackage(candidate)
  assert.deepEqual(sync.changed, [".claude-plugin/plugin.json"])
  assert.equal(result.ok, true)
})

test("version generation never touches the skill's own version", async (context) => {
  const candidate = await copyCandidate(context)
  const before = await readFile(resolve(candidate, skillPath, "SKILL.md"), "utf8")
  await editJson(resolve(candidate, "plugin.json"), (manifest) => { manifest.version = "9.9.9" })

  await synchronizeVersions({ root: candidate, write: true })
  assert.equal(await readFile(resolve(candidate, skillPath, "SKILL.md"), "utf8"), before)
  assert.equal((await validatePackage(candidate)).ok, true)
})

test("contract validation is independent of legal JSON property order", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "scripts/release-contract.json"), (contract) => {
    const reordered = {
      publishedFiles: contract.publishedFiles,
      skill: Object.fromEntries(Object.entries(contract.skill).reverse()),
      version: {
        dependents: contract.version.dependents.map((dependent) => Object.fromEntries(Object.entries(dependent).reverse())),
        source: Object.fromEntries(Object.entries(contract.version.source).reverse()),
      },
    }
    for (const key of Object.keys(contract)) delete contract[key]
    Object.assign(contract, reordered)
  })

  const result = await validatePackage(candidate)
  assert.deepEqual(result.errors, [])
})

test("YAML parsing handles folded scalars and nested metadata", () => {
  const content = `---
name: artifac
description: >-
  Build artifacts,
  even when a request does not name them.
metadata:
  release:
    version: "nested-lookalike"
  version: '1.2.3'
---

# Body
`
  const parsed = parseSkillFrontmatter(content)
  assert.equal(parsed.data.description, "Build artifacts, even when a request does not name them.")
  assert.equal(parsed.data.metadata.release.version, "nested-lookalike")
  assert.equal(parsed.data.metadata.version, "1.2.3")
  assert.equal(parsed.body.trim(), "# Body")
})

test("link extraction skips code, URLs, and fragments", () => {
  const markdown = "Read [one](references/a.md#top) and [two](./assets/b.html).\n`[no](skip.md)`\n```\n[no](skip.md)\n```\n[site](https://artif.ac) [abs](/root.md)"
  assert.deepEqual(relativeLinks(markdown), ["./assets/b.html", "references/a.md"])
})

test("canonical schemas reject unknown manifest properties", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "plugin.json"), (manifest) => { manifest.unrecognized = true })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith("plugin.json/") && error.includes("additional properties")))
})

test("vendored schema drift fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "schemas/agent-plugins/plugin.schema.json"), (schema) => { schema.title = "Tampered schema" })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("recorded SHA-256")))
})

test("credential-bearing MCP configuration is rejected", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "mcp.json"), (mcp) => { mcp.mcpServers.artifac.headers = { Authorization: "Bearer placeholder" } })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes("mcp.json artifac server must not declare request headers or credentials"))
})

test("credential-bearing Claude MCP configuration is rejected", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, ".mcp.json"), (mcp) => { mcp.mcpServers.artifac.headers = { Authorization: "Bearer placeholder" } })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes(".mcp.json artifac server must not declare request headers or credentials"))
})

test("a Claude MCP entry not typed http, or carrying more than type and url, fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, ".mcp.json"), (mcp) => {
    mcp.mcpServers.artifac.type = "streamable-http"
    mcp.mcpServers.artifac.oauth = { clientId: "placeholder" }
  })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith(".mcp.json server type")))
  assert.ok(result.errors.includes(".mcp.json artifac server must declare only type and url"))
})

test("a different server address fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, ".mcp.json"), (mcp) => { mcp.mcpServers.artifac.url = "https://mcp.example.com/mcp" })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith(".mcp.json server URL")))
})

test("a Gemini extension pointing anywhere but the Artifac server fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "gemini-extension.json"), (extension) => { extension.mcpServers.artifac.httpUrl = "https://mcp.example.com/mcp" })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith("gemini-extension.json server URL")))
})

test("a Gemini extension with credentials or another transport fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "gemini-extension.json"), (extension) => {
    extension.mcpServers.artifac.headers = { Authorization: "Bearer placeholder" }
  })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes("gemini-extension.json artifac server must declare only httpUrl"))
})

test("a Gemini extension with an unexpected field or a different name fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "gemini-extension.json"), (extension) => {
    extension.name = "artifac-gemini"
    extension.contextFileName = "GEMINI.md"
  })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes("gemini-extension.json must declare exactly name, version, description, and mcpServers"))
  assert.ok(result.errors.some((error) => error.startsWith("Gemini extension name")))
})

test("Gemini extension version drift fails validation and version generation repairs it", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "gemini-extension.json"), (extension) => { extension.version = "0.0.0" })
  assert.ok((await validatePackage(candidate)).errors.some((error) => error.includes("gemini-extension.json version")))

  const sync = await synchronizeVersions({ root: candidate, write: true })
  assert.deepEqual(sync.changed, ["gemini-extension.json"])
  assert.equal((await validatePackage(candidate)).ok, true)
})

test("a hooks declaration fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, ".claude-plugin/plugin.json"), (manifest) => { manifest.hooks = "./.claude-plugin/hooks.json" })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes(".claude-plugin/plugin.json must not declare hooks"))
})

test("a hooks file a host would load undeclared fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await mkdir(resolve(candidate, "hooks"))
  await writeFile(resolve(candidate, "hooks/hooks.json"), "{}")

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes("hooks must not exist: the plugin runs no hooks"))
})

test("a missing skill fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await rm(resolve(candidate, skillPath), { recursive: true, force: true })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes(`${skillPath}/SKILL.md is missing`)))
})

test("a skill whose name differs from its directory fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  const path = resolve(candidate, skillPath, "SKILL.md")
  await writeFile(path, (await readFile(path, "utf8")).replace('name: "artifac"', 'name: "artifac-renamed"'))

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith("Skill name")))
})

test("a SKILL.md link outside the packaged files fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  const path = resolve(candidate, skillPath, "SKILL.md")
  await writeFile(path, `${await readFile(path, "utf8")}\nSee [the maintainer notes](AGENTS.md).\n`)

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("links to AGENTS.md")))
})

test("listing skill files in publishedFiles fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "scripts/release-contract.json"), (contract) => {
    contract.publishedFiles = [...contract.publishedFiles, `${skillPath}/SKILL.md`].sort(compareText)
  })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes("must not list skill files")))
})

test("the OpenAI review needs five positive and three negative cases naming real tools", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "plugin.json"), (manifest) => {
    const cases = manifest.extensions["com.openai"].review.test_cases
    cases.positive[0].tools_triggered = "list_workspaces, publish_artifact"
    cases.negative.pop()
  })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes("OpenAI review needs exactly three negative test cases"))
  assert.ok(result.errors.some((error) => error.includes("unknown tool \"publish_artifact\"")))
})

test("an em dash in packaged prose fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  const path = resolve(candidate, skillPath, "references/errors.md")
  await writeFile(path, `${await readFile(path, "utf8")}\nA pause — here.\n`)

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes("Runtime prose contains an em or en dash"))
})

test("an uninitialized skill submodule fails validation in a real checkout", async (context) => {
  const clone = await cloneCandidate(context, { initialize: false })
  const result = await validatePackage(clone)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.includes(`${skillPath}/SKILL.md is missing`)))
})

test("a changed skill submodule fails validation in a real checkout", async (context) => {
  const clone = await cloneCandidate(context)
  assert.deepEqual((await validatePackage(clone)).errors, [])

  await writeFile(resolve(clone, skillPath, "references/extra.md"), "Not committed in the skill repository.\n")
  const result = await validatePackage(clone)
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes(`${skillPath} has uncommitted or untracked changes`))
})

test("release staging materializes the skill from its submodule and nothing else", async (context) => {
  const output = resolve(await temporary(context, "artifac-release-test-"), "artifac-package")
  const staged = await stageRelease({ root, output })
  const plugin = JSON.parse(await readFile(resolve(root, "plugin.json"), "utf8"))

  assert.deepEqual(await walk(output), [...staged.files].sort(compareText))
  assert.equal(staged.version, plugin.version)
  assert.ok(staged.files.includes("gemini-extension.json"), "Gemini CLI reads its manifest from the package root")
  assert.ok(staged.files.includes(`${skillPath}/SKILL.md`))
  assert.ok(staged.files.includes(`${skillPath}/LICENSE`))
  for (const path of staged.files.filter((file) => file.startsWith(`${skillPath}/`))) {
    assert.deepEqual(await readFile(resolve(output, path)), await readFile(resolve(root, path)), `${path} differs from the submodule`)
  }
  for (const maintainerFile of ["AGENTS.md", "CLAUDE.md", "README.md", ".gitmodules"]) {
    assert.ok(!staged.files.includes(`${skillPath}/${maintainerFile}`), `${maintainerFile} is not part of the package`)
  }
  assert.ok(!staged.files.some((file) => file.startsWith(`${skillPath}/.agents/`)))
})

test("the marketplace entry must install from the dist branch", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, ".claude-plugin/marketplace.json"), (marketplace) => { marketplace.plugins[0].source = "./" })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith("Claude marketplace source must install from the generated dist branch")))
})

test("a dist commit holds exactly the staged package and moves forward from the previous one", async (context) => {
  const clone = await cloneCandidate(context)
  const output = resolve(await temporary(context, "artifac-dist-stage-"), "package")
  const staged = await stageRelease({ root: clone, output })
  const author = { name: "Release Test", email: "release@example.com" }

  const first = await distCommit({ root: clone, staged: output, message: "Release v0.0.1", author })
  assert.equal(first.parent, null)
  const listed = git(clone, ["ls-tree", "-r", "--name-only", first.commit]).trim().split("\n").sort(compareText)
  assert.deepEqual(listed, [...staged.files].sort(compareText))
  for (const path of staged.files) {
    const blob = execFileSync("git", ["cat-file", "blob", `${first.commit}:${path}`], { cwd: clone })
    assert.deepEqual(blob, await readFile(resolve(output, path)), `${path} differs in the dist commit`)
  }
  assert.ok(git(clone, ["ls-tree", first.commit, "skills/artifac"]).startsWith("040000 tree"), "the skill is a directory, not a submodule")

  git(clone, ["update-ref", "refs/heads/dist", first.commit])
  const second = await distCommit({ root: clone, staged: output, parent: "refs/heads/dist", message: "Release v0.0.2", author })
  assert.equal(second.parent, first.commit)
  assert.equal(git(clone, ["rev-parse", `${second.commit}^`]).trim(), first.commit)
  assert.equal(git(clone, ["rev-parse", "HEAD"]).trim(), git(root, ["rev-parse", "HEAD"]).trim(), "no branch or checkout moved")
})

test("release publishing requires the tag to resolve to the current main tip and checks out the skill", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")
  assert.match(workflow, /git rev-parse "\$\{GITHUB_SHA\}\^\{commit\}"/)
  assert.match(workflow, /git rev-parse "origin\/main\^\{commit\}"/)
  assert.match(workflow, /test "\$\{tagged_commit\}" = "\$\{main_commit\}"/)
  assert.doesNotMatch(workflow, /merge-base --is-ancestor/)
  assert.match(workflow, /submodules: true/)
  assert.match(workflow, /node scripts\/dist-commit\.mjs --staged "dist\/artifac-\$\{VERSION\}"/)
  assert.match(workflow, /"\$\{commit\}:refs\/heads\/dist"/)
  assert.doesNotMatch(workflow, /push[^\n]*--force/)
  assert.match(await readFile(resolve(root, ".github/workflows/validate.yml"), "utf8"), /submodules: true/)
})

test("the release carries the package ZIP as its only asset, which Gemini CLI installs", async () => {
  const workflow = await readFile(resolve(root, ".github/workflows/release.yml"), "utf8")
  const create = workflow.slice(workflow.indexOf("gh release create"))
  const command = create.slice(0, create.search(/\n\s*\n|\n\s*-\s+name:|$/))
  const assets = command.split("\n").map((line) => line.trim()).filter((line) => /^"[^"]+"\s*\\?$/.test(line) && !line.includes("GITHUB_REF_NAME"))
  assert.deepEqual(assets, ['"dist/artifac-${VERSION}.zip" \\'])
  assert.match(workflow, /zip -X -r "artifac-\$\{VERSION\}\.zip" "artifac-\$\{VERSION\}"/)
  assert.match(workflow, /test "\$\(gh release view "\$\{GITHUB_REF_NAME\}" --json assets --jq '\.assets \| length'\)" = 1/)
  assert.doesNotMatch(workflow, /gh release upload/)
  const check = workflow.indexOf("--jq '.assets | length'")
  assert.ok(workflow.indexOf("--draft \\") < check && check < workflow.indexOf("--draft=false"), "the release is checked as a draft and published after")
})

test("OpenAI staging refuses a listing without a demo recording", async (context) => {
  const output = resolve(await temporary(context, "artifac-openai-"), "package")
  await assert.rejects(stageOpenAi({ root, output, checkLink: async () => true }), /demo_recording_url/)
})

test("OpenAI staging refuses while a listing link does not answer", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "plugin.json"), (manifest) => {
    manifest.extensions["com.openai"].review.demo_recording_url = "https://example.com/demo.mp4"
  })
  const output = resolve(await temporary(context, "artifac-openai-"), "package")
  const checkLink = async (url) => !url.endsWith("/privacy")
  await assert.rejects(stageOpenAi({ root: candidate, output, checkLink }), /privacyPolicyURL/)
})

test("a marketplace entry without the plugin's display name fails validation", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, ".claude-plugin/marketplace.json"), (marketplace) => { delete marketplace.plugins[0].displayName })

  const result = await validatePackage(candidate)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((error) => error.startsWith("Claude marketplace displayName")))
})

test("OpenAI staging adds the client registration setting, carries the skill, and leaves the repository file alone", async (context) => {
  const candidate = await copyCandidate(context)
  await editJson(resolve(candidate, "plugin.json"), (manifest) => {
    manifest.extensions["com.openai"].review.demo_recording_url = "https://example.com/demo.mp4"
  })
  const output = resolve(await temporary(context, "artifac-openai-"), "package")

  const staged = await stageOpenAi({ root: candidate, output, checkLink: async () => true })
  assert.deepEqual(await walk(output), [...staged.files].sort(compareText))
  assert.ok(staged.files.includes("plugin.json"))
  assert.ok(staged.files.includes(`${skillPath}/SKILL.md`))
  assert.ok(!staged.files.some((path) => path.startsWith(".")))
  for (const otherHost of ["README.md", "SETUP.md", "gemini-extension.json"]) {
    assert.ok(!staged.files.includes(otherHost), `${otherHost} is not part of the portal package`)
  }
  const stagedMcp = JSON.parse(await readFile(resolve(output, "mcp.json"), "utf8"))
  assert.deepEqual(stagedMcp.mcpServers.artifac.extensions, {
    "com.openai": { auth: { type: "oauth", client: { mode: "dcr" } } },
  })
  const own = JSON.parse(await readFile(resolve(candidate, "mcp.json"), "utf8"))
  assert.equal(own.mcpServers.artifac.extensions, undefined)
})
