"""
WCE Document Extraction Module
Extracts text from local documents and PDFs located in:
  - ingestion/sources/documents/
  - backend/data/raw/pdfs/
Uses Node pdfExtractor if pypdf is not installed in Python.
"""

import os
import json
import subprocess
from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parent.parent / "sources" / "documents"
BACKEND_PDFS_DIR = Path(__file__).resolve().parent.parent.parent / "backend" / "data" / "raw" / "pdfs"
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"

def extract_documents():
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    all_files = list(DOCS_DIR.glob("*.pdf")) + list(BACKEND_PDFS_DIR.glob("*.pdf"))
    
    extracted_docs = []
    report = {
        "files_found": len(all_files),
        "files": [f.name for f in all_files],
        "extracted_count": 0,
    }

    if not all_files:
        return extracted_docs, report

    # Use Node.js script with pdf-parse for high-fidelity extraction
    normalized_files = [str(p).replace("\\", "/") for p in all_files]
    js_helper = f"""
    const path = require('path');
    const fs = require('fs');
    const {{ extractPdf }} = require('{str(BACKEND_DIR / "ingestion" / "extractors" / "pdfExtractor.js").replace("\\", "/")}');
    
    async function run() {{
      const results = [];
      const files = {json.dumps(normalized_files)};
      for (const f of files) {{
        if (!fs.existsSync(f)) continue;
        const buf = fs.readFileSync(f);
        const name = path.basename(f);
        const res = await extractPdf(buf, 'https://walchandsangli.ac.in/wp-content/uploads/WCE_CAP-Reporting-New-Admissions-for-2026-27-2.pdf');
        if (res && res.pages) {{
          res.pages.forEach(p => {{
            results.push({{
              document_id: `pdf_${{path.parse(f).name}}_p${{p.page_number}}`,
              page_title: `WCE CAP Reporting New Admissions (${{name}} - Page ${{p.page_number}})`,
              title: `WCE CAP Reporting New Admissions (${{name}} - Page ${{p.page_number}})`,
              department: 'Admissions',
              category: 'admissions_document',
              section: 'cap_reporting',
              content: p.text,
              extracted_text: p.text,
              source_type: 'pdf_document',
              source_url: 'https://walchandsangli.ac.in/wp-content/uploads/WCE_CAP-Reporting-New-Admissions-for-2026-27-2.pdf',
              source_title: `CAP Reporting Instructions (${{name}})`,
              extraction_date: '2026-11-01',
              page_number: p.page_number,
              verification_status: 'official_pdf_extracted'
            }});
          }});
        }}
      }}
      console.log(JSON.stringify(results));
    }}
    run().catch(err => {{ console.error(err); process.exit(1); }});
    """

    try:
        res = subprocess.run(["node", "-e", js_helper], capture_output=True, encoding="utf-8", errors="ignore", check=True)
        extracted_docs = json.loads(res.stdout.strip())
    except Exception as e:
        print(f"[DocumentExtractor] Node PDF extraction warning: {e}")

    report["extracted_count"] = len(extracted_docs)
    return extracted_docs, report

if __name__ == "__main__":
    docs, rep = extract_documents()
    print("Documents extracted:", len(docs), rep)
