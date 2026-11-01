# WCE RAG Chatbot — Walchand College of Engineering, Sangli

A production-grade, authoritative Retrieval-Augmented Generation (RAG) assistant for **Walchand College of Engineering (WCE), Sangli**.

The chatbot answers campus, admission, curriculum, department, faculty, and placement questions with strict factual grounding against the verified official WCE website and institutional records.

---

## Key Highlights & Architectural Guarantees

1. **Strict 20-URL Source List & Crawler:**
   - Ingests all 20 exact verified official URLs covering the Homepage, Admissions (First-Year, PIO/OCI/FN/CIWG/NRI, Direct Second Year, Working Professionals), Mechanical Engineering, Information Technology, and Computer Engineering, plus Career Development Cell placement pages.
   - Raw HTML pages are preserved in `ingestion/sources/website/`.

2. **Authoritative IT HOD Override Layer:**
   - Enforces **Dr. U. B. Chavan** as the current Head of the Information Technology Department (`ingestion/corrections/authoritative_overrides.json`).
   - Reclassifies outdated leadership references (e.g. Dr. R. R. Rathod) as historical while preserving Dr. R. R. Rathod's faculty profile (Assistant Professor, Ph.D., 21 years of experience).

3. **Strict Separation of Internal Provenance from Chatbot Answers:**
   - **Zero Hyperlinks & Zero Raw URLs:** The assistant responds naturally and never displays clickable hyperlinks or raw URLs.
   - The Groq prompt context is completely sanitized of URLs so the LLM cannot hallucinate or echo web links.
   - Internal provenance and source URLs are kept strictly in server logs and debug inspection.
   - Standard API response format: `{ "reply": "..." }`.

4. **Multi-Source Ingestion Pipeline:**
   - Modular architecture:
     - `ingestion/sources/` (website, screenshots, documents)
     - `ingestion/extract/` (website scraper, screenshot OCR extractor, PDF extractor)
     - `ingestion/processing/` (data cleaning, authoritative deduplication, chunking, metadata)
     - `ingestion/embeddings/` (384-dimensional `sentence-transformers/all-MiniLM-L6-v2`)
     - `ingestion/vectorstore/` (atomic index build, validation, backup, search)
     - `ingestion/reports/` (`ingestion_report.json`, `extraction_review_report.json`)

5. **Safe Fallback for Insufficient Evidence:**
   - When evidence is absent, the chatbot acknowledges unavailability without inventing facts or URLs:
     *"I couldn't find verified information about this in the available WCE knowledge base. Please check the official college website for the latest details."*

---

## Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | React, Vite | Responsive UI, Markdown rendering with plain-text link safety |
| **Backend** | Node.js, Express | REST API (`/health`, `POST /api/chat`) |
| **LLM** | Groq API | Grounded in retrieved evidence (`openai/gpt-oss-120b` / `llama-3.3-70b-versatile`) |
| **Embeddings** | Sentence Transformers | Local `all-MiniLM-L6-v2` (384 dimensions) via `@xenova/transformers` |
| **Vector DB** | VectorStore JSON | Atomic writes, backups, cosine similarity, authority & department weighting |
| **Data Processing** | Python 3 + Node.js | BeautifulSoup, Cheerio, pdf-parse |

---

## Verified Target URLs (Strict Ingestion Scope)

### A. Homepage
1. `https://walchandsangli.ac.in/`

### B. Admissions
2. `https://walchandsangli.ac.in/admissions/first-year-btech/`
3. `https://walchandsangli.ac.in/admissions/first-year-of-btech-pio-oci-fn-ciwg-nri-students/`
4. `https://walchandsangli.ac.in/admissions/direct-second-year-b-tech/`
5. `https://walchandsangli.ac.in/admissions/btech-dse-working-professionals/`

### C. Mechanical Engineering Department
6. `https://walchandsangli.ac.in/department-of-mechanical-engineering/overview/`
7. `https://walchandsangli.ac.in/department-of-mechanical-engineering/b-tech-curriculum-with-minors-mech/`
8. `https://walchandsangli.ac.in/department-of-mechanical-engineering/m-tech-specialisations-and-curriculum-mech/`
9. `https://walchandsangli.ac.in/department-of-mechanical-engineering/faculty-mech/`
10. `https://walchandsangli.ac.in/department-of-mechanical-engineering/achievements-mech/`

### D. Information Technology Department
11. `https://walchandsangli.ac.in/department-of-information-technology/overview-it/`
12. `https://walchandsangli.ac.in/department-of-information-technology/b-tech-curriculum-with-minors-it/`
13. `https://walchandsangli.ac.in/department-of-information-technology/m-tech-specialisations-and-curriculum-it/`
14. `https://walchandsangli.ac.in/department-of-information-technology/academic-planning-activities-it/`
15. `https://walchandsangli.ac.in/department-of-information-technology/resources-it/`
16. `https://walchandsangli.ac.in/department-of-information-technology/faculty-it/`
17. `https://walchandsangli.ac.in/department-of-information-technology/students-development-it/`

### E. Computer Engineering Department
18. `https://walchandsangli.ac.in/department-of-computer-engineering/overview/`
19. `https://walchandsangli.ac.in/department-of-computer-engineering/b-tech-curriculum/`
20. `https://walchandsangli.ac.in/department-of-computer-engineering/faculty/`

### Additional Placement Pages Discovered via Official Homepage
- `https://walchandsangli.ac.in/student-careers/career-development-cell/placement-in-wce/`
- `https://walchandsangli.ac.in/student-careers/career-development-cell/trainings/`
- `https://walchandsangli.ac.in/student-careers/career-development-cell/internships/`
- `https://walchandsangli.ac.in/student-careers/career-development-cell/higher-education/`

---

## Screenshot Ingestion

Physical screenshot images should be placed in:
`ingestion/sources/screenshots/`

The module `ingestion/extract/extract_screenshots.py` handles OCR for any images placed there. If no images are physically present in the directory, the pipeline documents the status in `ingestion_report.json` without pretending they were processed.

---

## Exact Commands

### 1. Run the Knowledge Base Ingestion Pipeline
To crawl all verified URLs, extract documents, apply authoritative overrides, chunk, embed, and rebuild the vector database:

```bash
python ingestion/run_pipeline.py
```

### 2. Run Test Suites

#### A. Comprehensive Retrieval & Accuracy Test Suite
Tests IT HOD authoritative retrieval, query variants, Dr. R. R. Rathod profile preservation, admissions, mechanical/computer/placement domains, and strict URL isolation:

```bash
npm --prefix backend run test:accuracy
```

#### B. Full Unit Test Suite (Ingestion + RAG + Accuracy)
```bash
npm --prefix backend run test:all
```

#### C. Live Groq Chatbot Accuracy Test
Tests end-to-end question answering with Groq using live retrieved context:
```bash
node backend/tests/test_live_rag.js
```

### 3. Start the Backend Server
```bash
cd backend
npm start
```
Server runs at `http://localhost:5000` (Health check: `http://localhost:5000/health`).

### 4. Start the Frontend Application
```bash
cd frontend
npm run dev
```
UI available at `http://localhost:5173`.

---

## API Specification

### Chat Endpoint: `POST /api/chat`
**Request Body:**
```json
{
  "message": "Who is the current Head of the Information Technology Department?"
}
```

**Response Format:**
```json
{
  "reply": "The current Head of the Information Technology Department is Dr. U. B. Chavan."
}
```

*Internal debugging: pass `?debug=true` to view retrieved internal sources.*
