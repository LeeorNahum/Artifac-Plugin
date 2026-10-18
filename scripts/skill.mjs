// The bundled skill lives in its own repository and is a git submodule here,
// at the path every host reads skills from. Nothing in this repository copies
// its files: the release step materializes them from the submodule into the
// staged package, and this module says which files those are and whether the
// submodule is in a state a release may be built from.

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, statSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { relative, resolve, sep } from "node:path"

function walk(root, path) {
  const files = []
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) files.push(...walk(root, child))
    else if (entry.isFile()) files.push(relative(root, child).split(sep).join("/"))
  }
  return files
}

function compareText(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/**
 * The skill's runtime files, as repository-relative paths: SKILL.md and the
 * directories the Agent Skills specification defines, whichever exist. The
 * skill repository's maintainer files (its AGENTS.md, README.md, and its own
 * installed skills) are not part of the package.
 */
export function skillFiles(root, skill) {
  const skillRoot = resolve(root, skill.path)
  const files = []
  for (const entry of skill.include) {
    const path = resolve(skillRoot, entry)
    if (!existsSync(path)) continue
    if (statSync(path).isDirectory()) files.push(...walk(skillRoot, path))
    else files.push(entry)
  }
  return files.map((file) => `${skill.path}/${file}`).sort(compareText)
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

export function isGitCheckout(root) {
  return existsSync(resolve(root, ".git"))
}

/**
 * Whether the submodule is checked out at exactly the commit this
 * repository records, with nothing changed or added inside it. Only then
 * does a staged package hold the skill the release names.
 */
export function submoduleState(root, path) {
  const errors = []
  let commit = null
  let status
  try {
    status = git(root, ["submodule", "status", "--", path]).replace(/\r?\n$/, "")
  } catch (error) {
    return { commit, errors: [`git submodule status failed for ${path}: ${error.message}`] }
  }
  if (status === "") return { commit, errors: [`${path} is not a submodule of this repository`] }
  const marker = status[0]
  commit = status.slice(1, 41)
  if (marker === "-") errors.push(`${path} is not initialized. Run git submodule update --init -- ${path}`)
  else if (marker === "+") errors.push(`${path} is checked out at a different commit than this repository records`)
  else if (marker === "U") errors.push(`${path} has merge conflicts`)
  if (marker === " " || marker === "+") {
    const dirty = git(resolve(root, path), ["status", "--porcelain", "--untracked-files=all"]).trim()
    if (dirty !== "") errors.push(`${path} has uncommitted or untracked changes`)
  }
  return { commit, errors }
}

/** Relative Markdown link targets in a document, without fragments. */
export function relativeLinks(markdown) {
  const targets = new Set()
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "")
  for (const match of withoutCode.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].split("#")[0]
    if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) continue
    targets.add(target)
  }
  return [...targets].sort(compareText)
}

export async function readSkill(root, skill) {
  return await readFile(resolve(root, skill.path, "SKILL.md"), "utf8")
}
