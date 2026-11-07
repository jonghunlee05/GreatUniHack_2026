import "server-only";
import JSZip from "jszip";
import type Anthropic from "@anthropic-ai/sdk";
import type { SourceFile } from "@/lib/game-schema";

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

// The Claude API caps a request at 32 MB; leave headroom for base64 overhead.
export const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [".pdf", ".pptx", ".txt", ".md"];

export class IngestError extends Error {}

export type IngestedFile = {
  meta: SourceFile;
  block: ContentBlock;
};

/**
 * Turns one uploaded file into a Claude content block.
 * PDFs go to Claude as native documents (text + page images),
 * slides are unzipped and their text extracted, notes are passed as text.
 */
export async function ingestFile(file: File): Promise<IngestedFile> {
  const name = file.name;
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (ext === ".pdf") {
    return {
      meta: { name, kind: "pdf", sizeBytes: file.size },
      block: {
        type: "document",
        title: name,
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buf.toString("base64"),
        },
      },
    };
  }

  if (ext === ".pptx") {
    const text = await extractPptxText(buf);
    if (!text.trim()) throw new IngestError(`No text found in ${name}.`);
    return {
      meta: { name, kind: "slides", sizeBytes: file.size },
      block: textDocument(name, text),
    };
  }

  if (ext === ".txt" || ext === ".md") {
    const text = buf.toString("utf8");
    if (!text.trim()) throw new IngestError(`${name} is empty.`);
    return {
      meta: { name, kind: "notes", sizeBytes: file.size },
      block: textDocument(name, text),
    };
  }

  throw new IngestError(
    `${name}: unsupported file type. Upload ${ACCEPTED_EXTENSIONS.join(", ")}.`,
  );
}

function textDocument(name: string, text: string): ContentBlock {
  return {
    type: "document",
    title: name,
    source: { type: "text", media_type: "text/plain", data: text },
  };
}

/** Pulls slide text (and speaker notes) out of a .pptx, in slide order. */
async function extractPptxText(buf: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new IngestError("Could not open the slides file. Is it a valid .pptx?");
  }

  const slideNumber = (p: string) => Number(p.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const parts: string[] = [];
  for (const p of slidePaths) {
    const n = slideNumber(p);
    const slideText = xmlToText(await zip.file(p)!.async("string"));
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    const notesText = notesFile ? xmlToText(await notesFile.async("string")) : "";

    let section = `--- Slide ${n} ---\n${slideText}`;
    if (notesText) section += `\n[Speaker notes]\n${notesText}`;
    parts.push(section);
  }
  return parts.join("\n\n");
}

/** Joins <a:t> runs, one line per <a:p> paragraph. */
function xmlToText(xml: string): string {
  return xml
    .split(/<\/a:p>/)
    .map((para) =>
      [...para.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
        .map((m) => decodeXml(m[1]))
        .join(""),
    )
    .filter((line) => line.trim())
    .join("\n");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
