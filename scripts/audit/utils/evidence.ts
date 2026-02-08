/**
 * Evidence Generator Utility for MIHAS Forensic Audit System
 * 
 * Provides utilities for generating evidence objects with file paths,
 * line numbers, code snippets, and confidence levels.
 * 
 * Validates: Requirements 2.9, 9.6
 */

import { readFile as fsReadFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Evidence } from '../types';

/**
 * Configuration options for evidence generation
 */
export interface GenerateEvidenceOptions {
  /** Path to the file containing the issue */
  filePath: string;
  /** Specific line numbers where the issue was found */
  lineNumbers?: number[];
  /** Explanation of why this is flagged */
  reason: string;
  /** Code snippet (if already available) */
  codeSnippet?: string;
  /** Override confidence level (otherwise auto-assigned) */
  confidence?: Evidence['confidence'];
}

/**
 * Maximum number of lines to include in a code snippet
 */
const MAX_SNIPPET_LINES = 10;

/**
 * Assigns a confidence level based on the available evidence.
 * 
 * Confidence levels:
 * - 'certain': Has file path, line numbers, AND code snippet
 * - 'likely': Has file path AND (line numbers OR code snippet)
 * - 'possible': Has only file path or incomplete information
 * 
 * @param filePath - The file path (required)
 * @param lineNumbers - Optional line numbers
 * @param codeSnippet - Optional code snippet
 * @returns The assigned confidence level
 */
export function assignConfidence(
  filePath: string,
  lineNumbers?: number[],
  codeSnippet?: string
): Evidence['confidence'] {
  // Must have a valid file path
  if (!filePath || filePath.trim() === '') {
    return 'possible';
  }

  const hasLineNumbers = lineNumbers && lineNumbers.length > 0;
  const hasCodeSnippet = codeSnippet && codeSnippet.trim() !== '';

  // Certain: Has all three pieces of evidence
  if (hasLineNumbers && hasCodeSnippet) {
    return 'certain';
  }

  // Likely: Has file path and either line numbers or code snippet
  if (hasLineNumbers || hasCodeSnippet) {
    return 'likely';
  }

  // Possible: Has only file path
  return 'possible';
}

/**
 * Extracts a code snippet from a file at specific line numbers.
 * Uses Bun's file system APIs for reading files.
 * 
 * @param filePath - Path to the file (relative to project root)
 * @param lineNumbers - Array of line numbers to extract
 * @returns The extracted code snippet, or undefined if extraction fails
 */
export async function extractCodeSnippet(
  filePath: string,
  lineNumbers: number[]
): Promise<string | undefined> {
  if (!lineNumbers || lineNumbers.length === 0) {
    return undefined;
  }

  try {
    // Check if file exists
    if (!existsSync(filePath)) {
      return undefined;
    }

    const content = await fsReadFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Sort line numbers and get the range
    const sortedLines = [...lineNumbers].sort((a, b) => a - b);
    const minLine = Math.max(1, sortedLines[0]);
    const maxLine = Math.min(lines.length, sortedLines[sortedLines.length - 1]);

    // Calculate the range to extract (max 10 lines)
    let startLine = minLine;
    let endLine = maxLine;

    // If the range is too large, center around the first line number
    if (endLine - startLine + 1 > MAX_SNIPPET_LINES) {
      const centerLine = sortedLines[0];
      const halfRange = Math.floor(MAX_SNIPPET_LINES / 2);
      startLine = Math.max(1, centerLine - halfRange);
      endLine = Math.min(lines.length, startLine + MAX_SNIPPET_LINES - 1);
    }

    // Extract the lines (convert to 0-indexed)
    const snippetLines = lines.slice(startLine - 1, endLine);
    
    if (snippetLines.length === 0) {
      return undefined;
    }

    // Format with line numbers for context
    const formattedSnippet = snippetLines
      .map((line, index) => {
        const lineNum = startLine + index;
        const marker = lineNumbers.includes(lineNum) ? '>' : ' ';
        return `${marker} ${lineNum.toString().padStart(4)}: ${line}`;
      })
      .join('\n');

    return formattedSnippet;
  } catch (error) {
    // Log warning but don't fail - evidence can still be generated without snippet
    console.warn(`Warning: Could not extract code snippet from ${filePath}:`, error);
    return undefined;
  }
}

/**
 * Generates an Evidence object with the provided information.
 * Automatically assigns confidence level if not provided.
 * 
 * @param options - The evidence generation options
 * @returns A complete Evidence object
 */
export function generateEvidence(options: GenerateEvidenceOptions): Evidence {
  const { filePath, lineNumbers, reason, codeSnippet, confidence } = options;

  // Validate required fields
  if (!filePath || filePath.trim() === '') {
    throw new Error('Evidence requires a valid filePath');
  }

  if (!reason || reason.trim() === '') {
    throw new Error('Evidence requires a valid reason');
  }

  // Determine confidence level
  const assignedConfidence = confidence ?? assignConfidence(filePath, lineNumbers, codeSnippet);

  // Build the evidence object
  const evidence: Evidence = {
    filePath: filePath.trim(),
    reason: reason.trim(),
    confidence: assignedConfidence,
  };

  // Add optional fields if present
  if (lineNumbers && lineNumbers.length > 0) {
    // Filter out invalid line numbers and sort
    evidence.lineNumbers = lineNumbers
      .filter(n => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);
  }

  if (codeSnippet && codeSnippet.trim() !== '') {
    evidence.codeSnippet = codeSnippet.trim();
  }

  return evidence;
}

/**
 * Generates evidence with automatic code snippet extraction.
 * This is an async version that reads the file to extract the snippet.
 * 
 * @param options - The evidence generation options (codeSnippet will be auto-extracted if not provided)
 * @returns A Promise resolving to a complete Evidence object
 */
export async function generateEvidenceWithSnippet(
  options: GenerateEvidenceOptions
): Promise<Evidence> {
  const { filePath, lineNumbers, codeSnippet } = options;

  // If code snippet is already provided, use the sync version
  if (codeSnippet) {
    return generateEvidence(options);
  }

  // Try to extract code snippet if line numbers are provided
  let extractedSnippet: string | undefined;
  if (lineNumbers && lineNumbers.length > 0) {
    extractedSnippet = await extractCodeSnippet(filePath, lineNumbers);
  }

  // Generate evidence with the extracted snippet
  return generateEvidence({
    ...options,
    codeSnippet: extractedSnippet,
  });
}

/**
 * Creates a simple evidence object for cases where only file path is known.
 * Confidence will be 'possible'.
 * 
 * @param filePath - Path to the file
 * @param reason - Reason for flagging
 * @returns An Evidence object with 'possible' confidence
 */
export function createMinimalEvidence(filePath: string, reason: string): Evidence {
  return generateEvidence({
    filePath,
    reason,
    confidence: 'possible',
  });
}

/**
 * Creates evidence for a specific line in a file.
 * Useful for single-line issues.
 * 
 * @param filePath - Path to the file
 * @param lineNumber - The specific line number
 * @param reason - Reason for flagging
 * @returns An Evidence object
 */
export function createLineEvidence(
  filePath: string,
  lineNumber: number,
  reason: string
): Evidence {
  return generateEvidence({
    filePath,
    lineNumbers: [lineNumber],
    reason,
  });
}

/**
 * Creates evidence for a range of lines in a file.
 * 
 * @param filePath - Path to the file
 * @param startLine - Starting line number
 * @param endLine - Ending line number
 * @param reason - Reason for flagging
 * @returns An Evidence object
 */
export function createRangeEvidence(
  filePath: string,
  startLine: number,
  endLine: number,
  reason: string
): Evidence {
  const lineNumbers: number[] = [];
  for (let i = startLine; i <= endLine; i++) {
    lineNumbers.push(i);
  }
  return generateEvidence({
    filePath,
    lineNumbers,
    reason,
  });
}

/**
 * Validates an Evidence object to ensure it meets the required format.
 * 
 * @param evidence - The evidence object to validate
 * @returns True if valid, throws an error if invalid
 */
export function validateEvidence(evidence: Evidence): boolean {
  if (!evidence.filePath || evidence.filePath.trim() === '') {
    throw new Error('Evidence must have a valid filePath');
  }

  if (!evidence.reason || evidence.reason.trim() === '') {
    throw new Error('Evidence must have a valid reason');
  }

  const validConfidenceLevels: Evidence['confidence'][] = ['certain', 'likely', 'possible'];
  if (!validConfidenceLevels.includes(evidence.confidence)) {
    throw new Error(`Evidence confidence must be one of: ${validConfidenceLevels.join(', ')}`);
  }

  if (evidence.lineNumbers) {
    if (!Array.isArray(evidence.lineNumbers)) {
      throw new Error('Evidence lineNumbers must be an array');
    }
    for (const lineNum of evidence.lineNumbers) {
      if (!Number.isInteger(lineNum) || lineNum < 1) {
        throw new Error('Evidence lineNumbers must be positive integers');
      }
    }
  }

  return true;
}

/**
 * Formats evidence as a human-readable string for reports.
 * 
 * @param evidence - The evidence to format
 * @returns A formatted string representation
 */
export function formatEvidence(evidence: Evidence): string {
  const lines: string[] = [];

  lines.push(`File: ${evidence.filePath}`);
  
  if (evidence.lineNumbers && evidence.lineNumbers.length > 0) {
    if (evidence.lineNumbers.length === 1) {
      lines.push(`Line: ${evidence.lineNumbers[0]}`);
    } else {
      lines.push(`Lines: ${evidence.lineNumbers.join(', ')}`);
    }
  }

  lines.push(`Confidence: ${evidence.confidence}`);
  lines.push(`Reason: ${evidence.reason}`);

  if (evidence.codeSnippet) {
    lines.push('');
    lines.push('Code:');
    lines.push('```');
    lines.push(evidence.codeSnippet);
    lines.push('```');
  }

  return lines.join('\n');
}
