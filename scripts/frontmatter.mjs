import { isMap, parseDocument } from "yaml"

export function parseSkillFrontmatter(content) {
  const opening = content.match(/^---[ \t]*\r?\n/)
  if (!opening) throw new Error("SKILL.md must begin with a YAML frontmatter delimiter")

  const remainder = content.slice(opening[0].length)
  const closing = remainder.match(/^---[ \t]*(?:\r?\n|$)/m)
  if (!closing) throw new Error("SKILL.md frontmatter has no closing delimiter")

  const source = remainder.slice(0, closing.index)
  const document = parseDocument(source, { prettyErrors: true, uniqueKeys: true })
  if (document.errors.length > 0) {
    throw new Error(`SKILL.md frontmatter is invalid YAML: ${document.errors.map((error) => error.message).join(" | ")}`)
  }
  if (!isMap(document.contents)) throw new Error("SKILL.md frontmatter must be a YAML mapping")

  return {
    body: remainder.slice(closing.index + closing[0].length),
    data: document.toJS({ maxAliasCount: 0 }),
    document,
  }
}
