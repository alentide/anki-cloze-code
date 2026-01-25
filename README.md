# Anki Cloze Code

**English** | [中文](./README_zh.md)


A powerful tool to generate **Anki Cloze Deletion** cards from source code features syntax highlighting, AST-based cloze generation, and intelligent card splitting.

It is designed to help developers memorize code syntax, standard libraries, and algorithms by turning code snippets into interactive Anki cards.

## Philosophy

This tool is built on the concept of **"Code Intuition"** — moving beyond logical deduction (System 2) to training visual and muscular intuition (System 1). By treating Anki cards as "tickets" or "code katas" and using high-density clozes, we simulate the coding process to achieve embodied cognition of the codebase.


## Features

- **AST-Based Cloze Generation**: Uses `ts-morph` to intelligently identify and cloak:
    - Variable Identifiers
    - Critical Control Flow (`if`, `for`, `while`)
    - Logic & Comparison Operators (`&&`, `||`, `===`)
- **Syntax Highlighting**: Beautiful dark-mode syntax highlighting powered by `shiki`.
- **Intelligent Context**:
    - **Sticky Headers**: Shows the current function/class scope at the top of the card while scrolling.
    - **Breadcrumbs**: Dynamic path to the current code block.
- **Auto-Splitting**: Automatically splits large files into multiple Anki cards while preserving context.
- **Anki Integration**: Directly communicates with Anki via `AnkiConnect` to create decks and note types automatically.

## Prerequisites

1. **Anki Desktop** installed.
2. **AnkiConnect** add-on installed (Code: `2055492159`).
3. **Anki** must be running with AnkiConnect listening on `http://127.0.0.1:8765`.

## Installation

```bash
git clone https://github.com/alentide/anki-cloze-code.git
cd anki-cloze-code
pnpm install
```

## Usage

### 1. CLI Mode

Generate cards directly from a local file (`input.ts`).

1. Place your code in `input.ts`.
2. Run the generator:

```bash
# Default (Deck: dev, Tags: anki-cloze-code)
pnpm start

# Custom Deck and Tags
pnpm start --deck="MyAlgorithmDeck" --tags="algo,js"
```

### 2. Server Mode

Start a local server to accept code via HTTP requests (useful for IDE plugins or other integrations).

1. Start the server:
```bash
pnpm serve
```
The server will listen on `http://localhost:4000`.

2. Send a POST request to `/generate`:

```json
POST http://localhost:4000/generate
Content-Type: application/json

{
  "code": "function sum(a, b) { return a + b; }",
  "title": "Sum Function",
  "deck": "MyDeck",
  "tags": ["javascript", "basic"]
}
```

## Configuration

- **Splitting**: By default, large files are split into chunks of 50 clozes per card.
- **Model**: Automatically creates/updates the `anki-cloze-code` note type in Anki with custom CSS for syntax highlighting.
