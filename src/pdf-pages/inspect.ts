import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";

export type PdfFacts = { encrypted: boolean; signed: boolean; pageCount: number };
const name = PDFName.of;

export async function inspectPdf(bytes: Uint8Array): Promise<PdfFacts> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  if (doc.isEncrypted) return { encrypted: true, signed: false, pageCount: 0 };
  const form = doc.catalog.lookupMaybe(name("AcroForm"), PDFDict);
  const fields = form?.lookupMaybe(name("Fields"), PDFArray);
  const seen = new Set<PDFDict>();
  function hasSignature(field: PDFDict, inherited?: PDFName): boolean {
    if (seen.has(field)) return false;
    seen.add(field);
    const type = field.lookupMaybe(name("FT"), PDFName) ?? inherited;
    if (type === name("Sig") && field.get(name("V"))) return true;
    const kids = field.lookupMaybe(name("Kids"), PDFArray);
    if (!kids) return false;
    for (let i = 0; i < kids.size(); i++) {
      const child = kids.lookupMaybe(i, PDFDict);
      if (child && hasSignature(child, type)) return true;
    }
    return false;
  }
  let signed = false;
  if (fields) for (let i = 0; i < fields.size(); i++) {
    const field = fields.lookupMaybe(i, PDFDict);
    if (field && hasSignature(field)) { signed = true; break; }
  }
  return { encrypted: false, signed, pageCount: doc.getPageCount() };
}
