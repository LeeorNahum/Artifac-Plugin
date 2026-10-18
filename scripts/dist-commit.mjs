#!/usr/bin/env node

// Turns a staged package into the next commit of the dist branch, the ref the
// marketplace entry installs from. Some hosts copy a plugin from a Git clone
// without fetching submodules, so dist holds the skill as ordinary files.
// Only the release workflow writes dist, always through this script, on top
// of the previous dist commit so the branch only moves forward.

import { execFileSync } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function git(cwd, args, env = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function resolveCommit(root, ref) {
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])
  } catch {
    return null
  }
}

/**
 * Write the staged directory as a commit object in this repository and
 * return its SHA. The parent is `parent` when that ref exists. Nothing is
 * checked out and no branch moves: the caller pushes the commit.
 */
export async function distCommit({ root = scriptRoot, staged, parent, message, author }) {
  if (!staged || !message || !author?.name || !author?.email) throw new Error("staged, message, and author are required")
  const scratch = await mkdtemp(resolve(tmpdir(), "artifac-dist-index-"))
  try {
    const env = {
      GIT_INDEX_FILE: resolve(scratch, "index"),
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: author.name,
      GIT_COMMITTER_EMAIL: author.email,
    }
    const gitDir = git(root, ["rev-parse", "--absolute-git-dir"])
    // The staged tree is added exactly as it is, ignoring this repository's ignore rules and line-ending filters.
    git(resolve(staged), ["--git-dir", gitDir, "--work-tree", ".", "-c", "core.autocrlf=false", "add", "--all", "--force", "--", "."], env)
    const tree = git(root, ["write-tree"], env)
    const parentCommit = parent ? resolveCommit(root, parent) : null
    const args = ["commit-tree", tree, ...(parentCommit ? ["-p", parentCommit] : []), "-m", message]
    return { commit: git(root, args, env), tree, parent: parentCommit }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/dist-commit.mjs --staged DIRECTORY --message TEXT [--parent REF]\n\n`)
  process.stdout.write(`Write a staged package as the next dist commit and print its SHA as JSON. Pushing is the caller's.\n`)
  process.stdout.write(`The author is GIT_AUTHOR_NAME and GIT_AUTHOR_EMAIL from the environment.\n`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help")) {
    printHelp()
    return
  }
  const value = (flag) => {
    const index = args.indexOf(flag)
    return index === -1 ? undefined : args[index + 1]
  }
  const staged = value("--staged")
  const message = value("--message")
  if (!staged || !message) {
    printHelp()
    process.exitCode = 2
    return
  }
  const result = await distCommit({
    staged,
    message,
    parent: value("--parent"),
    author: { name: process.env.GIT_AUTHOR_NAME, email: process.env.GIT_AUTHOR_EMAIL },
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
