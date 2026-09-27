import "server-only";
import { createHash } from "node:crypto";
import sanitizeHtml from "sanitize-html";

export const MAX_WORD_BYTES = 12 * 1024 * 1024;
export const MAX_WORD_HTML_BYTES = 20 * 1024 * 1024;
export const WORD_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function isWordFile(name: string): boolean {
  return name.toLowerCase().endsWith(".docx");
}

export function wordRevision(objectKey: string, versionId: string): string {
  return createHash("sha256").update(objectKey).update("\0").update(versionId).digest("hex");
}

export function cleanWordHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "strong", "b", "em", "i", "u", "s", "strike", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td", "a", "img", "hr", "sub", "sup"],
    allowedAttributes: { a: ["href"], img: ["src", "alt", "width", "height"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["data"] },
    exclusiveFilter: (frame) => frame.tag === "img" && !/^data:image\/(?:png|jpeg|gif);base64,[A-Za-z0-9+/]+=*$/i.test(frame.attribs.src ?? ""),
  });
}
