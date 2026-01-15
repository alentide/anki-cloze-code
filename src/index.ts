/// <reference types="node" />
import { Project, SyntaxKind, Node } from "ts-morph";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

// 1. Configuration
const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
const DECK_NAME = "dev";
const INPUT_FILE = "input.ts";
const MAX_LINES_PER_CARD = 30;

// 2. Anki Connect Helper
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function invokeAnki(action: string, params: any = {}) {
    await sleep(200); // Small delay to prevent overwhelming AnkiConnect
    try {
        const response = await axios.post(ANKI_CONNECT_URL, {
            action,
            version: 6,
            params,
        }, {
            headers: { 'Connection': 'close' } // Force close connection
        });
        if (response.data.error) {
            console.error(`AnkiConnect Error [${action}]:`, response.data.error);
            return null;
        }
        return response.data.result;
    } catch (error: any) {
        console.error(`Network Error [${action}]:`, error.message);
        return null;
    }
}

// 3. Core Logic: Process Code
async function processCode() {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(INPUT_FILE); // Load input.ts
    const fullText = sourceFile.getFullText();
    const totalLines = sourceFile.getEndLineNumber();

    console.log(`Processing ${INPUT_FILE} (${totalLines} lines)...`);

    // Split into chunks if necessary (Naive line splitting for now, improved later)
    // For now, let's treat the whole file as one chunk or split strictly by lines.
    // Given the requirement "control around 30 lines", we'll chunk by lines.

    const lines = fullText.split("\n");
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    // Simple chunking logic
    for (const line of lines) {
        currentChunk.push(line);
        if (currentChunk.length >= MAX_LINES_PER_CARD) {
            chunks.push(currentChunk.join("\n"));
            currentChunk = [];
        }
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join("\n"));
    }

    console.log(`Split into ${chunks.length} chunks.`);

    console.log(`Checking connection to AnkiConnect...`);
    const version = await invokeAnki("version");
    if (!version) {
        console.error("Could not connect to AnkiConnect. Make sure Anki is running and AnkiConnect is installed.");
        return;
    }
    console.log(`Connected to AnkiConnect v${version}`);

    await invokeAnki("createDeck", { deck: DECK_NAME });

    // Fetch models to find Cloze
    const models = await invokeAnki("modelNames");
    let clozeModel = "Cloze";
    if (Array.isArray(models)) {
        const found = models.find((m: string) => m.toLowerCase().includes("cloze") || m.includes("填空"));
        if (found) {
            clozeModel = found;
            console.log(`Using model: ${clozeModel}`);
        } else {
            console.warn(`Could not find a Cloze model in ${models}. Defaulting to 'Cloze'.`);
        }
    } else {
        console.warn("Failed to fetch model names.");
    }

    for (let i = 0; i < chunks.length; i++) {
        await processChunk(chunks[i], i, clozeModel);
    }
}

async function processChunk(code: string, index: number, modelName: string) {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(`chunk_${index}.ts`, code);

    // Identify nodes to replace
    // We want to replace: Variables, Function Names, Literals (Strings, Numbers)
    // We will collect ranges to replace.

    const rangesToReplace: { start: number; end: number; text: string }[] = [];

    sourceFile.forEachDescendant((node) => {
        // Skip keywords, punctuation, whitespace
        if (
            Node.isIdentifier(node) ||
            Node.isStringLiteral(node) ||
            Node.isNumericLiteral(node) ||
            node.getKind() === SyntaxKind.TrueKeyword || 
            node.getKind() === SyntaxKind.FalseKeyword
        ) {
            // Logic to avoid overlapping ranges? 
            // `forEachDescendant` does deep traversal. Valid check might be needed.
            // But identifiers and literals are usually leaf nodes.
             if (node.getAncestors().some(a => Node.isImportDeclaration(a))) return; // Skip imports for now? Maybe user wants to learn them. Let's keep them.
             
             rangesToReplace.push({
                 start: node.getStart(),
                 end: node.getEnd(),
                 text: node.getText()
             });
        }
    });

    // Sort ranges reverse so we can replace without affecting indices
    rangesToReplace.sort((a, b) => b.start - a.start);

    // Deduplicate or check for overlaps if any (Leaf nodes shouldn't overlap)

    // Generate text with clozes
    // Strategy: We want multiple cards from this one massive code block?
    // "Automatically make massive cloze cards"
    // Option A: One card with {{c1::var1}}, {{c2::var2}} -> Generates N cards.
    // Option B: Group them?
    // Let's go with Option A: Each identifier is a separate cloze c1, c2, c3...
    
    let processedCode = code;
    // We need to rebuild the string because simple replacement changes indices.
    // Actually, simple string slicing works if we iterate reverse.
    
    let clozeIndex = 1;
    // We need to map which range gets which 'cN'.
    // If we use one big card with {{c1}}...{{c50}}, Anki makes 50 cards.
    // However, Anki Cloze has a limit on fields, but here we are putting it in 'Text' field.
    // Anki handles many clozes fine.

    // BUT, iterating reverse means the first item in array is the LAST in text.
    // So if we have 50 items, the last one in text gets c1? 
    // Usually people read top to bottom.
    // Let's re-sort to normal order to assign IDs, then apply replacements in reverse.

    rangesToReplace.sort((a, b) => a.start - b.start);
    
    // Assign IDs
    const replacementsWithIds = rangesToReplace.map((r, i) => ({
        ...r,
        id: i + 1
    }));

    // Apply Reverse
    replacementsWithIds.sort((a, b) => b.start - a.start);

    for (const item of replacementsWithIds) {
         const before = processedCode.substring(0, item.start);
         const after = processedCode.substring(item.end);
         // Example: {{c1::variableName}}
         const replacement = `{{c${item.id}::${item.text}}}`;
         processedCode = before + replacement + after;
    }

    // Prepare note
    // HTML formatting: Use <pre><code> for basic styling.
    // User wants VSCode Dark theme. For now we use basic grey background.
    const htmlContent = `
    <div style="background-color: #1e1e1e; color: #d4d4d4; padding: 20px; font-family: Consolas, 'Courier New', monospace; font-size: 14px; line-height: 1.5; border-radius: 5px;">
        <pre style="margin: 0; white-space: pre-wrap;">${escapeHtml(processedCode)}</pre>
    </div>
    `;

    console.log(`Generated Card for Chunk ${index}: ${replacementsWithIds.length} clozes.`);

    // Add to Anki
    await addToAnki(htmlContent, modelName);
}

function escapeHtml(unsafe: string) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function addToAnki(content: string, modelName: string) {
    // Check if deck exists, create if not?
    // User said "deck is dev".
    
    // await invokeAnki("createDeck", { deck: DECK_NAME }); // Already done in main
    
    const note = {
        deckName: DECK_NAME,
        modelName: modelName,
        fields: {
            Text: content
        },
        options: {
            allowDuplicate: true
        },
        tags: ["anki-cloze-code"]
    };

    const res = await invokeAnki("addNote", { note });
    if (res) {
        console.log(`Note added: ID ${res}`);
    } else {
        console.error("Failed to add note.");
    }
}

// Run
processCode().catch(console.error);
