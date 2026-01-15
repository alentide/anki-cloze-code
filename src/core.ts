import { Project, SyntaxKind, Node } from "ts-morph";
import axios from "axios";
import { createHighlighter, Highlighter, BundledTheme, BundledLanguage } from "shiki";

// 1. Configuration
const ANKI_CONNECT_URL = "http://127.0.0.1:8765";
const MAX_LINES_PER_CARD = 30;

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

async function ensureModel(modelName: string) {
    const models = await invokeAnki("modelNames");
    if (models && models.includes(modelName)) {
        console.log(`Model '${modelName}' exists.`);
        return;
    }

    console.log(`Model '${modelName}' not found. Creating...`);
    const result = await invokeAnki("createModel", {
        modelName: modelName,
        inOrderFields: ["Text"],
        css: `
.card {
 font-family: arial;
 font-size: 20px;
 text-align: center;
 color: black;
 background-color: white;
}

.cloze {
 font-weight: bold;
 color: blue;
}
.nightMode .cloze {
 color: lightblue;
}
`,
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

// 3. Core Logic: Process Code
let highlighter: Highlighter | null = null;

async function getHighlighter() {
    if (!highlighter) {
        highlighter = await createHighlighter({
            themes: ['dark-plus', 'vitesse-dark'],
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

async function processChunk(code: string, index: number, modelName: string, deckName: string, tags: string[]) {
    const project = new Project({ useInMemoryFileSystem: true });
    // ts-morph source file
    const sourceFile = project.createSourceFile(`chunk_${index}.ts`, code);

    // 1. Identify ranges from AST
    const rangesToReplace: { start: number; end: number; text: string }[] = [];
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
                 text: node.getText()
             });
        }
    });

    rangesToReplace.sort((a, b) => a.start - b.start);
    const replacementsWithIds = rangesToReplace.map((r, i) => ({ ...r, id: i + 1 }));

    // 2. Tokenize with Shiki
    const h = await getHighlighter();
    const { tokens } = h.codeToTokens(code, {
        lang: 'ts',
        theme: 'dark-plus' // Close to VSCode Dark
    });

    // 3. Merge Tokens and Ranges
    let htmlLines: string[] = [];
    let absIndex = 0;

    for (const lineTokens of tokens) {
        let lineHtml = "";
        
        for (const token of lineTokens) {
            const tokenStart = absIndex;
            const tokenEnd = absIndex + token.content.length;
            const tokenContent = token.content;
            const color = (token as any).color || "#d4d4d4"; // Force cast to any or check type

            const intersecting = replacementsWithIds.filter(r => 
                Math.max(r.start, tokenStart) < Math.min(r.end, tokenEnd)
            );

            if (intersecting.length > 0) {
                let processedToken = "";
                let lastSliceEnd = 0; // relative to token content (0 to length)
                
                // Find relevant parts relative to this token
                const chunksInToken: {startRel: number, endRel: number, id: number}[] = [];
                
                for (const r of intersecting) {
                    const overlapStart = Math.max(r.start, tokenStart);
                    const overlapEnd = Math.min(r.end, tokenEnd);
                    
                    if (overlapEnd > overlapStart) {
                        chunksInToken.push({
                            startRel: overlapStart - tokenStart,
                            endRel: overlapEnd - tokenStart,
                            id: r.id
                        });
                    }
                }
                
                if (chunksInToken.length === 0) {
                     processedToken = escapeHtml(tokenContent);
                } else {
                    for (const chunk of chunksInToken) {
                         // Add non-clozed part before
                         if (chunk.startRel > lastSliceEnd) {
                             processedToken += escapeHtml(tokenContent.substring(lastSliceEnd, chunk.startRel));
                         }
                         const segment = tokenContent.substring(chunk.startRel, chunk.endRel);
                         processedToken += `{{c${chunk.id}::${escapeHtml(segment)}}}`;
                         lastSliceEnd = chunk.endRel;
                    }
                    if (lastSliceEnd < tokenContent.length) {
                        processedToken += escapeHtml(tokenContent.substring(lastSliceEnd));
                    }
                }
                lineHtml += `<span style="color: ${color}">${processedToken}</span>`;

            } else {
                lineHtml += `<span style="color: ${color}">${escapeHtml(tokenContent)}</span>`;
            }
            
            absIndex = tokenEnd;
        }
        
        if (code[absIndex] === '\n') {
            absIndex++;
        } else if (code[absIndex] === '\r' && code[absIndex+1] === '\n') {
            absIndex += 2;
        }
        
        htmlLines.push(lineHtml);
    }

    const finalHtml = `
    <div style="background-color: #1e1e1e; color: #d4d4d4; padding: 20px; font-family: Consolas, 'Courier New', monospace; font-size: 14px; line-height: 1.5; border-radius: 5px;">
        <pre style="margin: 0; white-space: pre-wrap;">${htmlLines.join('\n')}</pre>
    </div>
    `;

    console.log(`Generated HTML with Shiki for Chunk ${index}.`);
    return await addToAnki(finalHtml, modelName, deckName, tags);
}

export async function generateCards(code: string, deckName: string, tags: string[]) {
    // Init highlighter early
    await getHighlighter();

    const lines = code.split("\n");
    const chunks: string[] = [];
    let currentChunk: string[] = [];

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
        const msg = "Could not connect to AnkiConnect. Make sure Anki is running and AnkiConnect is installed.";
        console.error(msg);
        return { success: false, message: msg };
    }
    console.log(`Connected to AnkiConnect v${version}`);

    await invokeAnki("createDeck", { deck: deckName });

    const MODEL_NAME = "anki-cloze-code";
    await ensureModel(MODEL_NAME);

    let addedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
        const res = await processChunk(chunks[i], i, MODEL_NAME, deckName, tags);
        if (res) addedCount++;
    }
    
    return { success: true, addedCount };
}
