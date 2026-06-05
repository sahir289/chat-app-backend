import { AppError } from "./appError";
import { getModuleLogger } from "./logger";

const log = getModuleLogger("pdfExtractor");

export async function extractTextFromPDF(
  fileBuffer: Buffer,
  fileName: string
): Promise<string> {
  try {
    const { PDFParse } = require("pdf-parse");
    
    const parser = new PDFParse({ data: fileBuffer });
    const result = await parser.getText();
    
    const extractedText = result.text?.trim() || "";
    
    await parser.destroy();
    
    if (!extractedText || extractedText.length === 0) {
      throw new AppError(400, "No text content found in PDF file");
    }
    
    log.info(`Successfully extracted ${extractedText.length} characters from ${fileName}`);
    
    return extractedText;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    
    log.error(`Failed to extract text from ${fileName}`, { err });
    throw new AppError(
      500, 
      `Failed to extract text from PDF: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}
