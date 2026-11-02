# Vocab Cards

A vocabulary trainer for language learners, built with React. Group your words into **programs** (one per course or exam, such as JLPT N5 or TOEFL), then practise them with **flashcards** and **quizzes** while the app tracks how well you know each word.

Everything runs in the browser. There is no server and no account: your data stays in `localStorage` on your device, and you can back it up to a single `.txt` file. The app is an installable **PWA** that works offline.

## Contents

- [Features](#features)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [How it works](#how-it-works)
- [Importing words](#importing-words)
- [Backup and storage](#backup-and-storage)
- [Online services](#online-services)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Performance](#performance)
- [Deployment](#deployment)
- [Known limitations](#known-limitations)

## Features

### Programs

- Create a program for each goal, with a name, a **word language** and one or more **levels**: CEFR (A1–C2), or JLPT (N5–N1) for Japanese. The word language cannot change later, so every word in a program uses the same one.
- Each program has its own **learning targets**, from 1 to 100 (default 100):
  - **Mastery target**: correct answers in a row needed to master a word.
  - **Quiz passed target**: correct quiz answers needed to pass a word.

  A new program starts with the targets you used last. They cannot change after the program is created.
- The Home page shows every program with its totals, a progress bar (mastered, in progress, not mastered, new) and its quiz progress. Each card can be shown or hidden, and so can all of them at once with **Show all** / **Hide all**.

### Words

- Add, edit, delete and search words (by word, romaji or meaning). The list shows 10 words per page.
- A word and its meaning must both be filled in before it can be added. A blank meaning is looked up online automatically, or on demand with **Search meaning**.
- Words and meanings are stored in Title Case.
- One word can have one entry per **meaning language**. The list shows it once, with every meaning beneath it.
- Duplicates are refused. The check ignores case, accents and punctuation (`café` = `cafe`), but keeps Japanese dakuten, so `まだ` (mada) and `また` (mata) count as different words.
- Each word shows its mastery and quiz progress, plus a **Passed** badge once it reaches the program's quiz target.
- **Load sample words**: download 1–100 words that match the program's language and levels.
- Export the list to Excel (`.xlsx`), reset the progress, or delete every word.

### Japanese support

- **Romaji input method**: type `benkyou` and pick 勉強, べんきょう or ベンキョウ from the list. Use Space or the arrow keys to move, Enter or 1–9 to choose, and Esc to close. Romaji left in the field becomes hiragana.
- Every Japanese word shows its **kana reading and romaji**, for example 右 → みぎ · migi. A word with kanji and no saved reading is looked up once, then the reading is saved.
- Imported romaji becomes kana, then kanji where there is one.

### Other languages

The word languages are English, Indonesian, Japanese, Spanish, German, French, Italian, Dutch, Portuguese and Polish. Each has its own profile in `src/languages/` covering its input hints, special characters (ñ, ß, é, ł…), speech voice and example-sentence source. Languages with special characters get a row of buttons to insert them.

### Flashcards

- Choose the meaning language, whether to shuffle, and whether to show only words you have not mastered yet.
- Flip the card, listen to the word or its meaning (using the browser's built-in speech), then choose **Mastery** or **Not mastered**.
- A correct answer adds one to the word's mastery, up to the program's target. A wrong answer resets it to 0.
- Keyboard: Space or Enter flips, → means mastery, ← means not mastered.

### Quiz

- **Options**: the meaning language; the number of questions (5, 10, 20, 30, 50, 75, 100 or all words); the direction (word → meaning, meaning → word, or mixed); and the answer type (multiple choice, typing, or mixed).
- Weaker words are asked first. You can then repeat only the words you got wrong.
- **Typed answers** ignore case, accents and punctuation. A meaning with several parts (separated by commas, or partly in parentheses) also accepts each part. One typo in a longer word still counts as correct.
- **Japanese**:
  - In *meaning → word*, every option shows its kana reading and romaji.
  - Typed answers use the romaji input method.
- Every correct quiz answer counts towards the word's **Passed** flag.
- Keyboard: press 1–4 to choose an option.

### Everything else

- **Import** many words at once from Excel, CSV or pasted text (see [Importing words](#importing-words)).
- **Backup** all programs, words and progress to one `.txt` file, and restore it on another device.
- **Light and dark mode**: the header button switches between them and the choice is remembered. Until you choose, the app follows your system setting.
- **Responsive layout**: on phones, the menu sits behind a hamburger button.
- **Installable PWA**: install it from the browser and keep using it offline.

## Getting started

You need **Node.js 22.12 or newer**.

```bash
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server with hot reload. |
| `npm run build` | Build for production into `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the unit tests with Jest. |
| `npm run test:coverage` | Run the tests and write a coverage report to `coverage/` (open `coverage/index.html`). |
| `npm run lint` | Check the code with ESLint. |

## How it works

### Data model

```text
Program  { id, name, wordLanguage, levels, masteredLevel, passedLevel, createdAt }
Word     { id, term, meaning, wordLanguage, meaningLanguage, romaji,
           mastery, quizPassed, attempts, correctCount, createdAt }
```

A word's status is calculated from these fields and the program's targets:

| Status | When |
| --- | --- |
| New | Never practised. |
| Not mastered | Practised, and the last answer was wrong (mastery is 0). |
| In progress | Mastery is between 1 and the mastery target. |
| Mastered | Mastery has reached the program's mastery target. |
| Passed (badge) | Correct quiz answers have reached the program's quiz passed target. |

### State and routing

- Programs and words live in one React context (`ProgramsProvider` in `src/features/vocabulary/VocabularyProvider.jsx`) with a reducer. `useVocabulary()` gives a page the current program's words and actions, and `usePrograms()` gives it every program.
- Routes use React Router's `BrowserRouter`, so addresses have no `#`:

  | Route | Page |
  | --- | --- |
  | `/` | Home: programs and the new-program form |
  | `/words/:programId` | Word list |
  | `/import/:programId` | Import |
  | `/flashcards/:programId` | Flashcards |
  | `/quiz/:programId` | Quiz |
  | `/backup` | Backup |

  Opening `/words`, `/import`, `/flashcards` or `/quiz` without a program first asks you to pick one.
- The Words, Import, Flashcards, Quiz and Backup pages are lazy-loaded. The Excel reader is only downloaded when you choose an `.xlsx` file.

## Importing words

1. Open **Import** for a program and choose the **meaning language** first.
2. Then do one of these:
   - **Upload a file**: `.xlsx`, `.csv`, `.tsv` or `.txt`, up to 5 MB and 5,000 rows. A `.csv` may use commas, semicolons or tabs. An old `.xls` file must be saved as `.xlsx` first. A template can be downloaded from the page.
   - **Paste text**: one word per line as `word, meaning`, up to 100 lines. Commas after the first stay in the meaning. Text copied straight from a spreadsheet (separated by tabs) works too.
3. Review the preview, then save. It shows rows with problems and words that already exist or repeat.

The first row may be a header in any order. These names are recognised, in any letter case:

| Field | Header names |
| --- | --- |
| Word | Word, Term, Vocabulary, Vocab, Kata, Kosakata, English, Inggris |
| Meaning | Meaning, Meaning result, Translation, Definition, Arti, Terjemahan, Indonesia, Indonesian, Definisi, Makna |

Without a header, column A is the word and column B is its meaning.

The meaning can be left blank. Blank meanings are translated into the chosen meaning language when the file is read or the pasted text is checked. For Japanese, romaji becomes kana and then kanji where there is one.

## Backup and storage

### Storage

| Key | Holds |
| --- | --- |
| `vocab-app:programs` | The program list (JSON). |
| `vocab-app:v1:program:<id>` | One program's words, compressed. |
| `vocab-app:settings` | The learning targets for the next new program. |
| `vocab-app:theme`, `vocab-app:*-open` | View preferences: theme and open sections. |

- **Compression**: word lists are compressed with [lz-string](https://github.com/pieroxy/lz-string) (`compressToUTF16`), which makes them roughly 6× smaller than plain JSON. At about 30–40 characters per word, tens of thousands of words fit within the usual 5 MB `localStorage` limit. Lists saved by older versions as plain JSON are still read, and are compressed on the next save.
- **Saving**: changes are saved 0.4 seconds after they stop, and immediately when the tab is hidden or closed. This keeps flashcards and quizzes smooth with large lists.
- **Validation**: everything read from storage is validated and repaired. If storage is blocked or full, the app keeps working for the current visit and shows a warning.

### Backup

- **Export** writes every program, word, piece of progress and setting to a `.txt` file such as `vocab-cards-backup-2026-11-03.txt`. The file holds compressed JSON in Base64, so it is plain ASCII text.
- **Import** reads both that format and older plain-JSON backups, then replaces all the data on the device. It is all or nothing: if the backup does not fit in storage, the old data is put back and nothing changes.
- The Backup page also shows how much browser storage the app uses.

## Online services

All online help uses free public services that need no API key or account. Every one of them is optional: if a service cannot be reached, you can still type the meaning or the word yourself.

| Purpose | Service |
| --- | --- |
| Meanings and translations | Google Translate public endpoints, with MyMemory as a fallback |
| Japanese romaji → kanji candidates | Google Input Tools, with a small built-in dictionary and kana conversion when offline |
| Japanese readings (romaji) of kanji words | Google Translate romanization |
| Example sentences | Tatoeba, plus dictionaryapi.dev for English |
| Sample words | JLPT word lists from `jlpt-vocab-api.vercel.app`, and frequency lists from `hermitdave/FrequencyWords` on GitHub for other languages |

To use a different Google Translate base URL, set `VITE_GOOGLE_TRANSLATE_BASE_URL` in a `.env` file.

## Project structure

Code is grouped by feature. Logic without React lives in plain `.js` modules, separate from the components, so it is easy to test.

```text
src/
  main.jsx               entry point: fonts, styles, service worker
  app/                   router (App.jsx) and the list of program sections
  pages/                 one thin file per route
  components/            shared UI: AppShell (header and menu), Button, Fields,
                         CollapsibleCard, ImeTextField, JapaneseReading, ...
  hooks/                 usePrograms, useVocabulary, useTargets, useTheme, ...
  features/
    programs/            program form, program cards, progress bars
    vocabulary/          word model, reducer, storage, provider, word form and list,
                         translation, example sentences, sample words
    import/              file reading, column detection, row parsing, import plan, preview
    flashcards/          deck, session state, card components
    quiz/                question builder, answer checking, session state, components
    backup/              backup format (create and parse)
  languages/             one profile per word language
    japanese/            romaji input method, kana/romaji conversion, kanji lookup,
                         offline dictionary
  lib/                   small utilities: text, csv, xlsx writer, pagination, random,
                         speech, theme, preferences, PWA registration
  styles/                Bootstrap theme (theme.scss) and app styles (app.css)
  tests/                 Jest tests, in the same folders as the code they test
```

### Tech stack

- **React 19** and **React Router 7**, built with **Vite 7**.
- **Bootstrap 5.3**, imported as Sass partials with only the components the app uses.
- **vite-plugin-pwa** (Workbox) for the service worker and the web app manifest.
- **read-excel-file** to read `.xlsx`. A small dependency-free writer in `src/lib/xlsx.js` creates the template and the exports.
- **wanakana** for romaji ↔ kana, and **lz-string** for compression.
- Self-hosted fonts from **Fontsource**: Instrument Sans, Bricolage Grotesque and IBM Plex Mono.

## Testing

```bash
npm test
npm run test:coverage
```

- **Jest** runs the tests as native ES modules, so no Babel is needed. The tests live in `src/tests/`, in the same folders as the code they test. For example, `src/features/quiz/generateQuiz.js` is tested in `src/tests/features/quiz/quiz.test.js`.
- **Conventions**:
  - Tests use `describe` and `it`.
  - Every title follows *should … when …*, for example `should import mada (まだ) when mata (また) already exists`.
  - Every test body follows Arrange / Act / Assert, with the three parts separated by blank lines.
- **Mocks**: network calls take an injected `fetchImpl`, and storage takes an injected `storage`. The tests never touch the network or the real `localStorage`.

## Performance

The production build is tuned for a fast first paint:

- **App shell first**: `index.html` holds a static app shell (the header and a loader) that paints before any JavaScript runs. The entry script is requested just after that first frame.
- **Inlined CSS**: unused Bootstrap classes are removed by PurgeCSS, and the remaining CSS is inlined into `index.html`.
- **Theme before paint**: the light or dark theme is applied before the first paint, so the screen does not flash.

Lighthouse on the production build (`npm run build && npm run preview`) scores **96–98** for performance and **100** for accessibility, best practices and SEO. Measure the production build, not the dev server.

## Deployment

The app is a static site, but it uses `BrowserRouter`, so the host must answer every app address (such as `/words/abc`) with `index.html`.

- **Vercel**: `vercel.json` already sets this up. It also sets the build command, the output folder (`dist`), an SPA rewrite, and cache headers: long-lived for `/assets/*`, always revalidated for the service worker and the manifest. Import the repository on vercel.com and deploy.
- **Other hosts**: serve `dist/` and add a "single-page app" rewrite of every path to `/index.html`.

## Known limitations

- Data lives in one browser on one device. Use **Backup** to move it to another browser or device.
- Online help (meanings, readings, kanji candidates, sample words, example sentences) needs a connection and depends on free third-party services.
- **Example sentences on flashcards do not load at the moment.** Browsers block Tatoeba's old API (`tatoeba.org/en/api_v0`) because it sends no CORS header. Moving to Tatoeba's newer API (`api.tatoeba.org`) should fix this.
