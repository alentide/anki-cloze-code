import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";
import { generateCards } from "./core";

// CLI Args Parsing
const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
    const index = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
    if (index === -1) return fallback;
    if (args[index].includes("=")) return args[index].split("=")[1];
    return args[index + 1] || fallback;
}

const DECK_NAME = getArg("deck", "dev");
const TAGS = getArg("tags", "anki-cloze-code").split(",").map(t => t.trim()).filter(Boolean);
const INPUT_FILE = "input.ts";

async function main() {
    console.log(`Configuration: Deck="${DECK_NAME}", Tags=[${TAGS.join(", ")}]`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`Input file ${INPUT_FILE} not found.`);
        return;
    }

    const code = fs.readFileSync(INPUT_FILE, "utf-8");
    const result = await generateCards(code, DECK_NAME, TAGS);
    
    if (result.success) {
        console.log(`Success! Added ${result.addedCount} cards.`);
    } else {
        console.error("Failed:", result.message);
    }
}

main().catch(console.error);
