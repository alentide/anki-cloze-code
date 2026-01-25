import { ensureModel } from "./core";

async function main() {
    console.log("Updating Anki Note Type (anki-cloze-code)...");
    try {
        await ensureModel("anki-cloze-code");
        console.log("Template update finished.");
    } catch (e) {
        console.error("Error updating template:", e);
    }
}

main();
