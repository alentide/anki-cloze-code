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
 background-color: #1e1e1e;
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
    padding: 0; /* Container padding handled by header/pre */
    font-family: Consolas, 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.5;
    text-align: left;
}

.fixed-header {
    position: sticky; /* Sticky is better for iOS than fixed */
    top: 0;
    background-color: #1e1e1e;
    z-index: 1000;
    padding: 10px 20px;
    border-bottom: 1px solid #333;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    margin-bottom: 10px;
}

.sticky-header {
    background-color: #2d2d2d;
    color: #9cdcfe;
    padding: 5px 10px;
    border-left: 3px solid #0e639c;
    margin-top: 5px;
    font-size: 12px;
    white-space: pre;
    border-radius: 3px;
    overflow-x: auto;
}

.meta-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #888;
    font-size: 12px;
}

.context-line {
    opacity: 0.5;
    background-color: #252526;
}

pre {
 margin: 0;
 padding: 0 10px 20px 10px; /* Add bottom padding */
 white-space: pre-wrap;
}
`;

// Template with Auto-Scroll & Dynamic Breadcrumbs Script
const CARD_TEMPLATES = [
    {
        Name: "Cloze",
        Front: `
<div class="card-content">
    {{cloze:Text}}
</div>
<script>
    // Auto-scroll to active cloze
    setTimeout(function() {
        var cloze = document.querySelector('.cloze');
        if (cloze) {
            cloze.scrollIntoView({behavior: "smooth", block: "center"});
        }
    }, 100);

    // Dynamic Breadcrumbs
    (function() {
        var header = document.querySelector('.sticky-header');
        var lines = document.querySelectorAll('.code-line');
        if (!header || lines.length === 0) return;

        var updateBreadcrumb = function() {
            var offset = 120; // Approximation of header height
            for (var i = 0; i < lines.length; i++) {
                var rect = lines[i].getBoundingClientRect();
                // Find first line that is mainly visible or just entering
                if (rect.bottom > offset) {
                    var scope = lines[i].getAttribute('data-scope');
                    if (scope) {
                        header.innerText = scope;
                    } else {
                        // Empty scope (top level)? Keep previous or clear?
                        // Usually clear or set to file name? 
                        // Let's keep it if we are inside a scope that spans empty lines?
                        // Actually our getStickyHeader returns null for top level.
                        header.innerText = "";
                    }
                    break;
                }
            }
        };

        window.addEventListener('scroll', updateBreadcrumb);
        // Initial call
        updateBreadcrumb();
    })();
</script>
`,
        Back: `
<div class="card-content">
    {{cloze:Text}}
</div>
<script>
    setTimeout(function() {
        var cloze = document.querySelector('.cloze');
        if (cloze) {
            cloze.scrollIntoView({behavior: "smooth", block: "center"});
        }
    }, 100);

    (function() {
        var header = document.querySelector('.sticky-header');
        var lines = document.querySelectorAll('.code-line');
        if (!header || lines.length === 0) return;

        var updateBreadcrumb = function() {
            var offset = 120; 
            for (var i = 0; i < lines.length; i++) {
                var rect = lines[i].getBoundingClientRect();
                if (rect.bottom > offset) {
                    var scope = lines[i].getAttribute('data-scope');
                    if (scope) header.innerText = scope;
                    else header.innerText = "";
                    break;
                }
            }
        };
        window.addEventListener('scroll', updateBreadcrumb);
        updateBreadcrumb();
    })();
</script>
`
    }
];

async function ensureModel(modelName: string) {
    const models = await invokeAnki("modelNames");
    if (models && models.includes(modelName)) {
        console.log(`Model '${modelName}' exists. Updating styling and templates...`);
        // Force update CSS
        await invokeAnki("updateModelStyling", {
            model: {
                name: modelName,
                css: MODEL_CSS
            }
        });
        // Force update Templates (for JS)
        await invokeAnki("updateModelTemplates", {
            model: {
                name: modelName,
                templates: {
                    "Cloze": {
                        Front: CARD_TEMPLATES[0].Front,
                        Back: CARD_TEMPLATES[0].Back
                    }
                }
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
        cardTemplates: CARD_TEMPLATES
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

// Optimization: Cache scopes?
function getStickyHeader(sourceFile: SourceFile, line: number): string | null {
    // line is 0-indexed in our logic, but ts-morph uses mostly parsed structure
    // Let's get position
    try {
        // Optimization: Use getPositionOfLineAndCharacter directly without splitting text again (done in outer scope)
        // But sourceFile holds full text.
        // We need bound check?
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
             // Basic Name
             let name = "";
             if (Node.isClassDeclaration(s) || Node.isFunctionDeclaration(s) || Node.isMethodDeclaration(s) || Node.isInterfaceDeclaration(s)) {
                 name = s.getName() || "Anonymous";
             }
             return name;
        });

        return breadcrumbs.join(" > ");
    } catch (e) {
        return null;
    }
}

function smartSplit(code: string): { start: number, end: number }[] {
    const lines = code.split('\n');
    // DISABLED SPLITTING: Return single chunk covering all lines
    return [{ start: 0, end: lines.length }];
}

export async function generateCards(code: string, title: string, deckName: string, tags: string[]) {
    await getHighlighter();
    
    // 1. Parse Full File
    const project = new Project({ useInMemoryFileSystem: true });
    // Normalize newlines to \n for consistency
    const cleanCode = code.replace(/\r\n/g, '\n'); 
    const lines = cleanCode.split('\n');
    const sourceFile = project.createSourceFile("input.ts", cleanCode);

    // 2. Identify Cloze Ranges (Full File)
    const rangesToReplace: { start: number; end: number; id: number }[] = [];
    let clozeIdCounter = 1;

    const CRITICAL_OPERATORS = new Set([
        // Logic
        "&&", "||", "??", "!",
        // Comparison
        ">", "<", ">=", "<=", "===", "!==", "==", "!=",
        // Assessment / Mutation
        "+=", "-=", "*=", "/=", "%=",
        // Math (Critical)
        "%" 
    ]);

    sourceFile.forEachDescendant((node) => {
        // 1. Existing: Identifiers & Literals
        if (
            Node.isIdentifier(node) ||
            Node.isStringLiteral(node) ||
            Node.isNumericLiteral(node) ||
            node.getKind() === SyntaxKind.TrueKeyword || 
            node.getKind() === SyntaxKind.FalseKeyword
        ) {
             if (node.getAncestors().some(a => Node.isImportDeclaration(a))) return;
             // Avoid property access names? e.g. console.log -> log?
             // User didn't complain yet.
             
             rangesToReplace.push({
                 start: node.getStart(),
                 end: node.getEnd(),
                 id: clozeIdCounter++ 
             });
        }
        
        // 2. Critical Operators (Binary: &&, ||, +=, >, %)
        if (Node.isBinaryExpression(node)) {
            const opToken = node.getOperatorToken();
            const opText = opToken.getText();
            if (CRITICAL_OPERATORS.has(opText)) {
                rangesToReplace.push({
                    start: opToken.getStart(),
                    end: opToken.getEnd(),
                    id: clozeIdCounter++ 
                });
            }
        }

        // 3. Unary Operators (Only !)
        if (Node.isPrefixUnaryExpression(node)) {
            // operator token is SyntaxKind.ExclamationToken
            if (node.getOperatorToken() === SyntaxKind.ExclamationToken) {
                 // Wait, getOperatorToken() returns the kind number for PrefixUnary?
                 // checking ts-morph docs: getOperatorToken() returns the kind (number).
                 rangesToReplace.push({
                     start: node.getStart(), // ! is at the start usually
                     end: node.getStart() + 1,
                     id: clozeIdCounter++ 
                 });
            }
        }
    });

    
    // 3. Tokenize Full File
    const h = await getHighlighter();
    const { tokens } = h.codeToTokens(cleanCode, {
        lang: 'ts',
        theme: 'dark-plus'
    });

    // 4. Batch Clozes (Chunk by Cloze Count)
    const MAX_CLOZES_PER_NOTE = 50;
    // Sort ranges by start position
    rangesToReplace.sort((a, b) => a.start - b.start);
    
    // Split into batches
    const batches = [];
    for (let i = 0; i < rangesToReplace.length; i += MAX_CLOZES_PER_NOTE) {
        batches.push(rangesToReplace.slice(i, i + MAX_CLOZES_PER_NOTE));
    }
    
    console.log(`Found ${rangesToReplace.length} clozes. Split into ${batches.length} notes (Max ${MAX_CLOZES_PER_NOTE} per note).`);

    // 5. Connect Anki
    const version = await invokeAnki("version");
    if (!version) return { success: false, message: "AnkiConnect not found." };
    await invokeAnki("createDeck", { deck: deckName });
    const MODEL_NAME = "anki-cloze-code";
    await ensureModel(MODEL_NAME);

    let addedCount = 0;
    
    // 6. Process Batches
    // Each batch creates ONE Note containing the FULL Code, but only a subset of clozes active.
    
    for (let bIndex = 0; bIndex < batches.length; bIndex++) {
        const currentBatch = batches[bIndex];
        // Create a Set of IDs or Start positions for fast lookup
        // Actually we just need to know if a range is in this batch.
        // We can assign local IDs (1..50) for the current batch.
        
        // Map Range Start -> New Cloze ID (1..50)
        // Only for ranges in this batch.
        const activeClozeMap = new Map<number, number>();
        currentBatch.forEach((r, i) => {
            activeClozeMap.set(r.start, i + 1);
        });
        
        // We render the FULL FILE for every note.
        // Single chunk coverage.
        const chunkStartLine = 0;
        const chunkEndLine = lines.length;
        
        // Sticky Header IS NOW DYNAMIC. Initial State?
        // Let's get header for first line.
        const initialStickyHeader = getStickyHeader(sourceFile, chunkStartLine);
        
        let htmlLines: string[] = [];
        
        const renderLine = (lineIndex: number) => {
             const lineTokens = tokens[lineIndex];
             // get line start pos
             const lineStartPos = sourceFile.compilerNode.getPositionOfLineAndCharacter(lineIndex, 0);
             let currentPos = lineStartPos;
             
             // Dynamic Breadcrumb Scope for this line
             const lineScope = getStickyHeader(sourceFile, lineIndex);
             const scopeAttr = lineScope ? `data-scope="${escapeHtml(lineScope)}"` : "";
             
             let lineHtml = "";
             
             for (const token of lineTokens) {
                 const tokenContent = token.content;
                 const tokenEndPos = currentPos + tokenContent.length;
                 const color = (token as any).color || "#d4d4d4";
                 
                 // Check intersection with ANY range (active or inactive)
                 // We need to know if we should render it as `{{cX::...}}` or just text.
                 
                 // Optimization: subset of ranges near this line?
                 // Filter all ranges? might be slow if 2000 ranges.
                 // But typically < 1000.
                 
                 const intersecting = rangesToReplace.filter(r => 
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
                         
                         // Check if active in this batch
                         const activeId = activeClozeMap.get(r.start);
                         
                         return { start, end, id: activeId }; // id undefined if not active
                     });
                     
                     // Sort
                     localRanges.sort((a,b) => a.start - b.start);
                     
                     for (const lr of localRanges) {
                         if (lr.start > relCursor) {
                             processed += escapeHtml(tokenContent.substring(relCursor, lr.start));
                         }
                         const seg = tokenContent.substring(lr.start, lr.end);
                         
                         if (lr.id !== undefined) {
                             // Active Cloze
                             processed += `{{c${lr.id}::${escapeHtml(seg)}}}`;
                         } else {
                             // Inactive Cloze - just render text (maybe add a subtle style?)
                             // User didn't ask for style, just plain code.
                             processed += escapeHtml(seg);
                         }
                         
                         relCursor = lr.end;
                     }
                     if (relCursor < tokenContent.length) {
                         processed += escapeHtml(tokenContent.substring(relCursor));
                     }
                     
                     lineHtml += `<span style="color: ${color}">${processed}</span>`;
                 }
                 currentPos = tokenEndPos;
             }
             return `<div class="code-line" ${scopeAttr}>${lineHtml}</div>`;
        };

        for (let i = chunkStartLine; i < chunkEndLine; i++) {
            htmlLines.push(renderLine(i));
        }

        // Final HTML - Add Batch info to title? "Title (1/3)"
        const batchTitle = batches.length > 1 ? `${title} (${bIndex + 1}/${batches.length})` : title;

        const finalHtml = `
<div class="code-container">
    <div class="fixed-header">
        <div class="meta-header">
            ${batchTitle ? `<strong>${escapeHtml(batchTitle)}</strong> &mdash; ` : ''}
            <span>${deckName}</span>
            <span style="float: right; opacity: 0.7;">${tags.join(", ")}</span>
        </div>
        <div class="sticky-header">${initialStickyHeader ? escapeHtml(initialStickyHeader) : ''}</div>
    </div>
    <pre>${htmlLines.join('\n')}</pre>
</div>
`;
        const res = await addToAnki(finalHtml, MODEL_NAME, deckName, tags);
        if (res) addedCount++;
    }

    return { success: true, addedCount };
}

