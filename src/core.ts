import { Project, SyntaxKind, Node, SourceFile } from "ts-morph";
import axios from "axios";
import { createHighlighter, Highlighter } from "shiki";

// 1. Configuration
const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
const TARGET_EFFECTIVE_LINES = 30;
const CONTEXT_LINES_COUNT = 3;

// 2. Anki Connect Helper
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function invokeAnki(action: string, params: any = {}) {
    await sleep(200);
    try {
        const response = await axios.post(ANKI_CONNECT_URL, {
            action,
            version: 6,
            params,
        }, {
             headers: { 'Connection': 'close' }
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

async function addToAnki(content: string, modelName: string, deckName: string, tags: string[]) {
    const note = {
        deckName: deckName,
        modelName: modelName,
        fields: {
            Text: content
        },
        options: {
            allowDuplicate: true
        },
        tags: tags
    };

    const res = await invokeAnki("addNote", { note });
    if (res) {
        console.log(`Note added: ID ${res}`);
        return res;
    } else {
        console.error("Failed to add note.");
        return null;
    }
}

const MODEL_CSS = `
.card {
 font-family: arial;
 font-size: 20px;
 text-align: center;
 color: black;
 background-color: white;
}

.cloze {
 font-weight: bold;
 color: #FFD700;
 background-color: rgba(255, 255, 255, 0.1);
 border-bottom: 2px solid #FFD700;
 padding: 0 4px;
 border-radius: 4px;
}
.nightMode .cloze {
 color: #FFD700;
 background-color: rgba(255, 255, 255, 0.1);
 border-bottom: 2px solid #FFD700;
}

/* Custom Structure */
.code-container {
    background-color: #1e1e1e;
    color: #d4d4d4;
    padding: 10px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.5;
    border-radius: 5px;
    text-align: left;
    overflow-x: auto;
}

.sticky-header {
    background-color: #2d2d2d;
    color: #9cdcfe;
    padding: 5px 10px;
    border-left: 3px solid #0e639c;
    margin-bottom: 10px;
    font-size: 12px;
    white-space: pre;
    border-radius: 3px;
}

.meta-header {
    display: flex;
    justify-content: space-between;
    color: #888;
    font-size: 11px;
    margin-bottom: 5px;
    border-bottom: 1px solid #333;
    padding-bottom: 2px;
}

.context-line {
    opacity: 0.5;
    background-color: #252526;
}

pre {
 margin: 0;
 white-space: pre-wrap;
}
`;

async function ensureModel(modelName: string) {
    const models = await invokeAnki("modelNames");
    if (models && models.includes(modelName)) {
        console.log(`Model '${modelName}' exists. Updating styling...`);
        // Always force update CSS to ensure latest changes are applied
        await invokeAnki("updateModelStyling", {
            model: {
                name: modelName,
                css: MODEL_CSS
            }
        });
        return;
    }

    console.log(`Model '${modelName}' not found. Creating...`);
    const result = await invokeAnki("createModel", {
        modelName: modelName,
        inOrderFields: ["Text"],
        css: MODEL_CSS,
        isCloze: true,
        cardTemplates: [
            {
                Name: "Cloze",
                Front: "{{cloze:Text}}",
                Back: "{{cloze:Text}}"
            }
        ]
    });
    
    if (result && result.error) {
        console.error("Failed to create model:", result.error);
    } else {
        console.log(`Model '${modelName}' created successfully.`);
    }
}

// 3. Core Logic
let highlighter: Highlighter | null = null;

async function getHighlighter() {
    if (!highlighter) {
        highlighter = await createHighlighter({
            themes: ['dark-plus'],
            langs: ['typescript', 'ts'],
        });
    }
    return highlighter;
}

function escapeHtml(unsafe: string) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function isEffectiveLine(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length === 0) return false;
    // Helper lines like "}," "];" or simple comments, or just syntax chars
    if (/^[\}\]\)\;]+$/.test(trimmed)) return false; 
    return true;
}

function getStickyHeader(sourceFile: SourceFile, line: number): string | null {
    // line is 0-indexed in our logic, but ts-morph uses mostly parsed structure
    // Let's get position
    try {
        const lines = sourceFile.getFullText().split('\n');
        // Simple check: if we are out of bounds
        if (line >= lines.length) return null;
        
        const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(line, 0);
        
        let node = sourceFile.getDescendantAtPos(pos);
        if (!node) return null;

        // Find ancestors that are "Scopes"
        const ancestors = node.getAncestors();
        const scopes = ancestors.filter(a => 
            Node.isClassDeclaration(a) || 
            Node.isFunctionDeclaration(a) || 
            Node.isMethodDeclaration(a) ||
            Node.isInterfaceDeclaration(a)
        );

        if (scopes.length === 0) return null;

        // Take the closest 2 scopes? or just the closest?
        // Let's take the closest one
        const closest = scopes[0]; // Ancestors are usually bottom-up in ts-morph? No, getAncestors returns closest first? 
        // Actually getAncestors usually returns root first? Let's check doc/behavior.
        // Actually typically it is bottom-up (closest parent first).
        
        // Let's construct a breadcrumb: Class > Method
        // Reversing to get Top > Down
        const breadcrumbs = scopes.reverse().map(s => {
             let text = s.getText().split('\n')[0];
             if (text.length > 60) text = text.substring(0, 57) + "...";
             return text;
        });

        return breadcrumbs.join(" > ");
    } catch (e) {
        return null;
    }
}

function smartSplit(code: string): { start: number, end: number }[] {
    const lines = code.split('\n');
    const chunks: { start: number, end: number }[] = [];
    
    let currentStart = 0;
    let effectiveCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        if (isEffectiveLine(lines[i])) {
            effectiveCount++;
        }
        
        if (effectiveCount >= TARGET_EFFECTIVE_LINES) {
            chunks.push({ start: currentStart, end: i + 1 });
            currentStart = i + 1;
            effectiveCount = 0;
        }
    }
    
    if (currentStart < lines.length) {
        chunks.push({ start: currentStart, end: lines.length });
    }
    
    return chunks;
}

export async function generateCards(code: string, title: string, deckName: string, tags: string[]) {
    await getHighlighter();
    
    // 1. Parse Full File
    const project = new Project({ useInMemoryFileSystem: true });
    // Normalize newlines to \n for consistency
    const cleanCode = code.replace(/\r\n/g, '\n'); 
    const sourceFile = project.createSourceFile("input.ts", cleanCode);

    // 2. Identify Cloze Ranges (Full File)
    const rangesToReplace: { start: number; end: number; id: number }[] = [];
    let clozeIdCounter = 1;

    sourceFile.forEachDescendant((node) => {
        if (
            Node.isIdentifier(node) ||
            Node.isStringLiteral(node) ||
            Node.isNumericLiteral(node) ||
            node.getKind() === SyntaxKind.TrueKeyword || 
            node.getKind() === SyntaxKind.FalseKeyword
        ) {
             if (node.getAncestors().some(a => Node.isImportDeclaration(a))) return;
             
             rangesToReplace.push({
                 start: node.getStart(),
                 end: node.getEnd(),
                 id: clozeIdCounter++ 
             });
        }
    });
    
    // 3. Tokenize Full File
    const h = await getHighlighter();
    const { tokens } = h.codeToTokens(cleanCode, {
        lang: 'ts',
        theme: 'dark-plus'
    });

    // 4. Split
    const chunks = smartSplit(cleanCode);
    console.log(`Split into ${chunks.length} chunks based on effective lines.`);

    // 5. Connect Anki
    const version = await invokeAnki("version");
    if (!version) return { success: false, message: "AnkiConnect not found." };
    await invokeAnki("createDeck", { deck: deckName });
    const MODEL_NAME = "anki-cloze-code";
    await ensureModel(MODEL_NAME);

    let addedCount = 0;
    
    // 6. Process Chunks
    
    for (const chunk of chunks) {
        // Prepare data for this chunk
        const chunkStartLine = chunk.start; // 0-indexed inclusive
        const chunkEndLine = chunk.end;     // 0-indexed exclusive
        
        // Context: 3 lines before
        const contextStart = Math.max(0, chunkStartLine - CONTEXT_LINES_COUNT);
        const contextEnd = chunkStartLine;
        
        // Sticky Header
        const stickyHeader = getStickyHeader(sourceFile, chunkStartLine);
        
        // Build HTML
        let htmlLines: string[] = [];
        
        // --- Simplified Token Processing Logic for Chunk ---
        // 1. Collect all relevant global clozes for this chunk
        const chunkStartPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(chunkStartLine, 0);
        // Be careful with end line.
        let chunkEndPos;
        try {
             chunkEndPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(chunkEndLine, 0);
        } catch (e) {
             chunkEndPos = sourceFile.getFullText().length;
        }
        
        const relevantClozes = rangesToReplace.filter(r => r.start >= chunkStartPos && r.end <= sourceFile.getEnd()); // filter roughly
        // Map global IDs to local 1..N
        const globalToLocalId = new Map<number, number>();
        let localId = 1;
        
        const renderLine = (lineIndex: number, isContext: boolean) => {
             const lineTokens = tokens[lineIndex];
             // get line start pos
             const lineStartPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(lineIndex, 0);
             let currentPos = lineStartPos;
             
             let lineHtml = "";
             
             for (const token of lineTokens) {
                 const tokenContent = token.content;
                 const tokenEndPos = currentPos + tokenContent.length;
                 const color = (token as any).color || "#d4d4d4";
                 
                 if (isContext) {
                      lineHtml += `<span style="color: ${color}">${escapeHtml(tokenContent)}</span>`;
                 } else {
                     // Check intersection
                     const intersecting = relevantClozes.filter(r => 
                        r.start < tokenEndPos && r.end > currentPos
                     );
                     
                     if (intersecting.length === 0) {
                         lineHtml += `<span style="color: ${color}">${escapeHtml(tokenContent)}</span>`;
                     } else {
                         // Overlap logic
                         let processed = "";
                         let relCursor = 0;
                         
                         // Relative ranges
                         const localRanges = intersecting.map(r => {
                             const start = Math.max(r.start, currentPos) - currentPos;
                             const end = Math.min(r.end, tokenEndPos) - currentPos;
                             
                             let cId = globalToLocalId.get(r.start);
                             if (!cId) {
                                 cId = localId++;
                                 globalToLocalId.set(r.start, cId);
                             }
                             
                             return { start, end, id: cId };
                         });
                         
                         // Sort
                         localRanges.sort((a,b) => a.start - b.start);
                         
                         for (const lr of localRanges) {
                             if (lr.start > relCursor) {
                                 processed += escapeHtml(tokenContent.substring(relCursor, lr.start));
                             }
                             const seg = tokenContent.substring(lr.start, lr.end);
                             processed += `{{c${lr.id}::${escapeHtml(seg)}}}`;
                             relCursor = lr.end;
                         }
                         if (relCursor < tokenContent.length) {
                             processed += escapeHtml(tokenContent.substring(relCursor));
                         }
                         
                         lineHtml += `<span style="color: ${color}">${processed}</span>`;
                     }
                 }
                 currentPos = tokenEndPos;
             }
             return lineHtml;
        };

        for (let i = contextStart; i < contextEnd; i++) {
            htmlLines.push(`<div class="context-line" style="user-select: none;">${renderLine(i, true)}</div>`);
        }
        for (let i = chunkStartLine; i < chunkEndLine; i++) {
            htmlLines.push(`<div class="code-line">${renderLine(i, false)}</div>`);
        }

        // Final HTML
        const finalHtml = `
<div class="code-container">
    <div class="meta-header">
        ${title ? `<strong>${escapeHtml(title)}</strong> &mdash; ` : ''}
        <span>${deckName}</span>
        <span style="float: right; opacity: 0.7;">${tags.join(", ")}</span>
    </div>
    ${stickyHeader ? `<div class="sticky-header">${escapeHtml(stickyHeader)}</div>` : ''}
    <pre>${htmlLines.join('\n')}</pre>
</div>
`;
        const res = await addToAnki(finalHtml, MODEL_NAME, deckName, tags);
        if (res) addedCount++;
    }

    return { success: true, addedCount };
}

