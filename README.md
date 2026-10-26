# WCE RAG Chatbot

A Retrieval-Augmented Generation (RAG) chatbot for answering questions
about **Walchand College of Engineering (WCE), Sangli** using
information retrieved from college-related documents and web pages.

The backend retrieves relevant text chunks from a local vector index and
passes that context to the Groq-powered language model. The project also
includes an ingestion pipeline for collecting and processing approved
WCE web pages and PDF documents.

> **Project status:** Update the configuration names, environment
> variables, commands, and screenshots below if they differ from your
> current repository. Never commit API keys, private data, generated
> datasets, or local model/index files.


## Features

-   College-focused question answering using retrieved context.
-   Website crawling and HTML/PDF text extraction.
-   Text normalization, chunking, and overlapping chunks for retrieval.
-   Local semantic embeddings using `all-MiniLM-L6-v2` through
    `@xenova/transformers`.
-   Cosine-similarity search over a persisted vector index.
-   Groq API integration on the backend, keeping the API key out of
    frontend code.
-   Source information returned with answers where available.
-   React + Vite frontend.
-   Automated tests for ingestion and RAG components.


## Technology Stack


| Layer | Technologies |
|---|---|
| **Frontend** | React, Vite, JavaScript |
| **UI & Animation** | Framer Motion, project UI libraries |
| **Backend** | Node.js, Express |
| **LLM** | Groq API |
| **Embeddings** | `@xenova/transformers`, `all-MiniLM-L6-v2` |
| **Retrieval** | Cosine similarity |
| **Data Ingestion** | Node.js, HTML extraction, PDF text extraction |
| **Persistence** | JSONL processed documents, JSON vector index |
| **Testing** | Node.js test scripts and project test runner |

## Prerequisites

Install the following before running the project:

-   [Node.js](https://nodejs.org/) --- use a version supported by your
    dependencies.
-   npm (included with Node.js).
-   A Groq API key for LLM responses.
-   Git.
-   Internet access for the initial crawl and, depending on the
    embedding package configuration, the first download of the embedding
    model.

Check your installation:

``` bash
node --version
npm --version
git --version
```


## 1. Clone the Repository

Replace the placeholder with your GitHub repository URL:

``` bash
git clone https://github.com/<YOUR-USERNAME>/<YOUR-REPOSITORY>.git
cd "<YOUR-REPOSITORY>"
```

## 2. Install Dependencies

Install dependencies in both applications:

``` bash
cd backend
npm install
cd ../frontend
npm install
cd ..
```

If the repository uses npm lockfiles, prefer `npm ci` for a clean,
reproducible installation:

``` bash
cd backend
npm ci
cd ../frontend
npm ci
cd ..
```

Use either `npm install` or `npm ci`, depending on whether you want to
install from the lockfile. Do not run frontend commands from the
repository root unless the root `package.json` explicitly defines them.

## 3. Configure Environment Variables

Create the environment file expected by your backend (commonly
`backend/.env`). Use the variable names referenced in the backend source
code or `.env.example`.

Example template:

``` dotenv
# Example only — use the exact names expected by your code.
GROQ_API_KEY=your_groq_api_key
PORT=5000
```

If the frontend needs a backend URL, configure the variable used by your
Vite code, for example:

``` dotenv
# Example only — use the exact variable referenced by your frontend.
VITE_API_BASE_URL=http://localhost:5000
```

### Environment-variable safety

-   Never put `GROQ_API_KEY` in a `VITE_*` variable. Vite variables are
    exposed to browser code.
-   Never commit `.env` files.
-   Add `.env` to `.gitignore`; commit a safe `.env.example` containing
    placeholder values only.
-   Do not expose API keys in screenshots, logs, source maps, or public
    issues.
-   Restart the relevant development server after changing environment
    variables.

## 4. Collect and Process WCE Data

The ingestion pipeline collects approved pages from the configured WCE
seed URLs, extracts text from HTML and PDFs, normalizes the content, and
saves processed documents.

The configured seed URLs may include:

-   `https://walchandsangli.ac.in/`
-   `https://walchandsangli.ac.in/admissions/`
-   `https://walchandsangli.ac.in/campus-life/departments/`
-   `https://walchandsangli.ac.in/academics-programmes/calendars-and-schedules/`
-   `https://walchandsangli.ac.in/notices/`

The authoritative list is the one in `backend/ingestion/config.js`.

From the backend directory:

``` bash
cd backend
node ingestion/index.js
```

This command is the expected entry point based on the current project
layout. If your `backend/package.json` defines an ingestion script, you
can use that script instead.

### What ingestion does

1.  Reads the configured seed URLs.
2.  Checks crawl restrictions and follows the configured domain
    allowlist.
3.  Fetches pages with the crawler's retry and delay settings.
4.  Extracts readable text from HTML pages and supported PDFs.
5.  Normalizes and deduplicates content.
6.  Saves processed documents to the configured JSONL output and updates
    the manifest.

Expected output paths in this project:

``` text
backend/data/processed/wce_documents.jsonl
backend/data/raw/pdfs/
backend/data/manifest.json
```

The exact files created depend on the pages successfully fetched and
extracted. Check the terminal output and manifest to confirm the run
completed.

### Before crawling

-   Respect the website's `robots.txt`, terms, rate limits, and access
    restrictions.
-   Crawl only pages you are authorized to access.
-   Do not attempt to bypass authentication, access controls, or
    anti-bot protections.
-   Re-run ingestion when the source content changes and you want the
    chatbot to reflect those changes.

## 5. Generate Embeddings and Build the Vector Index

**You must build the vector index before expecting retrieval-based
answers.** Ingestion creates processed text; indexing converts that text
into chunks and numeric embeddings that can be searched.

From the `backend/` directory, run:

``` bash
npm run rag:index
```

To rebuild the index from scratch, use the project's reindex command:

``` bash
npm run rag:reindex
```

The current project scripts are expected to be named `rag:index` and
`rag:reindex`. Confirm the exact names in `backend/package.json`. If
those scripts are absent, inspect the `scripts` section and run the file
specified there (the indexing entry point is expected to be
`rag/indexer.js`).

### What the indexing process does

1.  Reads `data/processed/wce_documents.jsonl`.
2.  Splits documents into overlapping text chunks.
3.  Uses `all-MiniLM-L6-v2` to generate a vector embedding for each
    chunk.
4.  Saves chunk text, metadata, and embeddings to the vector store.
5.  Makes the index available to the retriever.

Current configuration described by the implementation:

-   Chunk size: approximately 600 tokens.
-   Chunk overlap: approximately 100 tokens.
-   Embedding dimensions: 384.
-   Similarity method: cosine similarity.
-   Vector index path: `backend/data/vector_store/index.json`.

These values are implementation settings, not universal requirements.
Verify `backend/rag/chunker.js`, `backend/rag/embedder.js`, and
`backend/rag/vectorStore.js` if you change the configuration.

### When should you regenerate embeddings?

Regenerate the index when:

-   You run ingestion and the source documents change.
-   You change the chunk size or overlap.
-   You change the embedding model.
-   You change metadata or the format expected by the vector store.
-   The index is missing, corrupted, or out of sync with processed
    documents.

Typical refresh sequence:

``` bash
cd backend
node ingestion/index.js
npm run rag:reindex
```

The first embedding run may take longer because the model may need to be
downloaded and initialized. Keep the generated index out of Git unless
you intentionally decide to distribute it.

## 6. Start the Backend

Open a terminal:

``` bash
cd backend
npm run dev
```

If `dev` is not defined in `backend/package.json`, inspect the available
scripts:

``` bash
npm run
```

Then use the development or start script that your backend defines, for
example `npm start`.

Confirm that the terminal reports the server is listening on the
configured port. If the backend exposes a health endpoint, use that
endpoint to verify it is responding; do not assume a health route exists
unless it is implemented.

## 7. Start the Frontend

Open a **second terminal**:

``` bash
cd frontend
npm run dev
```

Vite will print a local URL, commonly `http://localhost:5173/`. Open the
exact URL printed in your terminal.

If you see `vite is not recognized`, run:

``` bash
cd frontend
npm install
npm run dev
```

If the error continues, check that `vite` is listed in
`frontend/package.json` and installed locally. Avoid installing Vite
globally as the first fix.

### Local development checklist

-   [ ] Backend dependencies are installed.
-   [ ] Backend `.env` contains the required API key.
-   [ ] Ingestion completed successfully.
-   [ ] Embeddings and the vector index were generated.
-   [ ] Backend is running.
-   [ ] Frontend is running.
-   [ ] Frontend requests point to the correct backend URL.
-   [ ] Browser developer tools show no unresolved API, CORS, or network
    errors.

## 8. Run Tests

Run the available backend tests from `backend/`:

``` bash
cd backend
npm test
```

The project may also define dedicated RAG and full test commands:

``` bash
npm run test:rag
npm run test:all
```

Check `backend/package.json` for the exact scripts before running them.
If a script is missing, use the test command configured by the
repository.

After changing retrieval logic, test at least the following:

-   A question whose answer is clearly present in an indexed source.
-   A question that should retrieve a specific department, admission
    notice, or academic calendar.
-   A question for which the knowledge base has no answer.
-   A question that should return more than one source.
-   A question containing spelling variations or paraphrased wording.
-   Behavior when the vector index is missing or empty.
-   Behavior when the Groq API key is missing or the provider returns an
    error.

## How RAG Works

RAG stands for **Retrieval-Augmented Generation**. It combines document
search with a language model.

### During indexing (offline preparation)

1.  **Collect:** Download permitted content from configured WCE pages.
2.  **Extract:** Convert HTML and PDF content into text.
3.  **Chunk:** Split long documents into smaller, overlapping pieces.
4.  **Embed:** Convert each chunk into a vector using the embedding
    model.
5.  **Store:** Save the vectors and their metadata in the vector index.

### During a chat request (runtime)

1.  The user submits a question.
2.  The backend converts the question into an embedding.
3.  The retriever searches for similar chunks using cosine similarity.
4.  The most relevant chunks are selected according to the configured
    top-K and similarity threshold.
5.  The backend sends the question and retrieved context to Groq.
6.  The model generates a response grounded in the supplied context.
7.  The backend returns the answer and available source details to the
    frontend.

### Why use embeddings?

A keyword search mainly looks for matching words. Embeddings represent
semantic meaning, which can help retrieve relevant content even when the
question uses different wording from the source.

### Important limitation

RAG can still return incomplete or incorrect answers. Retrieval quality
depends on source quality, extraction, chunking, embedding quality, and
similarity settings. Always verify important college
information---especially deadlines, admission requirements, fees, and
placement statistics---against the latest official source.

## Troubleshooting

  -----------------------------------------------------------------------
  Problem                             Things to check
  ----------------------------------- -----------------------------------
  `vite is not recognized`            Run `npm install` inside
                                      `frontend/`; confirm Vite is listed
                                      in `frontend/package.json`.

  `Cannot find module`                Run `npm install` in the directory
                                      for the application that reports
                                      the error.

  Missing Groq API key                Check the backend `.env` and the
                                      exact environment-variable name
                                      read by the backend. Restart the
                                      backend.

  Chat answers are unrelated          Confirm the index exists, run the
                                      indexer, inspect retrieved chunks,
                                      and tune chunking/top-K/threshold
                                      only after testing.

  No documents found                  Run ingestion first and verify the
                                      JSONL path configured in the
                                      indexer.

  Index is stale                      Re-run ingestion and then reindex.

  First indexing run is slow          The embedding model may be
                                      downloading or initializing. Check
                                      network access and the terminal
                                      output.

  Frontend cannot reach backend       Verify the backend is running, the
                                      frontend API base URL is correct,
                                      and CORS is configured for the
                                      frontend origin.

  `401` or provider error             Check the API key, provider account
                                      limits, and backend error logs.
                                      Never print the key in logs.

  Table or Markdown formatting looks  Check that the frontend Markdown
  wrong                               renderer supports GitHub Flavored
                                      Markdown tables, and test the
                                      layout on mobile.
  -----------------------------------------------------------------------

## Data, Privacy, and Responsible Use

-   Use official, publicly accessible sources where possible.
-   Respect the source website's crawl rules and terms.
-   Keep secrets in environment variables, never in source code.
-   Do not upload personal, confidential, or restricted documents
    without permission.
-   Make it clear to users that chatbot answers should be verified
    against official WCE sources.
-   Preserve source URLs and document metadata so users can verify
    answers.
-   Configure the application to state when the knowledge base does not
    contain enough evidence rather than inventing college-specific
    details.
-   Review the `.gitignore` file before pushing generated documents or
    vector indexes to GitHub.

## Future Improvements

-   Scheduled ingestion and index refresh.
-   Better source attribution and direct links to source pages.
-   Retrieval evaluation with a fixed set of test questions.
-   Hybrid retrieval combining semantic similarity and keyword search.
-   Metadata filtering by department, document type, or academic year.
-   Admin interface to monitor ingestion and indexing status.
-   Improved fallback behavior when retrieval returns insufficient
    evidence.
-   Deployment configuration, rate limiting, logging, and monitoring.

## Contributing

1.  Fork the repository.
2.  Create a feature branch.
3.  Make a focused change.
4.  Run the relevant tests.
5.  Open a pull request describing the change and how it was tested.



------------------------------------------------------------------------

**Maintainer:** Varadraj Jagtap\
**Project:** WCE RAG Chatbot --- Walchand College of Engineering,
Sangli.
