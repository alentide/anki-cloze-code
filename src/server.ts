import express from "express";
import cors from "cors";
import { generateCards } from "./core";
import path from "path";

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

app.post("/generate", async (req, res) => {
    const { code, title, deck, tags } = req.body;
    
    if (!code) {
        res.status(400).json({ error: "Code is required" });
        return;
    }

    const deckName = deck || "dev";
    const tagList = Array.isArray(tags) ? tags : (tags || "anki-cloze-code").split(",").map((t: string) => t.trim());

    try {
        const result = await generateCards(code, title || "", deckName, tagList);
        res.json(result);
    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
