"""
WCE Web Scraper Module
Crawls the 20 exact verified official WCE URLs + discovered placement links.
Extracts structured headings, paragraphs, tables, faculty records, curriculum, and admissions data.
Saves raw HTML copies in ingestion/sources/website/ and returns structured document records.
"""

import os
import re
import ssl
import time
import hashlib
import urllib.request
from urllib.parse import urljoin, urlparse
from pathlib import Path
from bs4 import BeautifulSoup

RAW_WEBSITE_DIR = Path(__file__).resolve().parent.parent / "sources" / "website"

# The 20 exact verified URLs
TARGET_URLS = [
    # A. Homepage
    "https://walchandsangli.ac.in/",
    # B. Admissions
    "https://walchandsangli.ac.in/admissions/first-year-btech/",
    "https://walchandsangli.ac.in/admissions/first-year-of-btech-pio-oci-fn-ciwg-nri-students/",
    "https://walchandsangli.ac.in/admissions/direct-second-year-b-tech/",
    "https://walchandsangli.ac.in/admissions/btech-dse-working-professionals/",
    # C. Mechanical Engineering Department
    "https://walchandsangli.ac.in/department-of-mechanical-engineering/overview/",
    "https://walchandsangli.ac.in/department-of-mechanical-engineering/b-tech-curriculum-with-minors-mech/",
    "https://walchandsangli.ac.in/department-of-mechanical-engineering/m-tech-specialisations-and-curriculum-mech/",
    "https://walchandsangli.ac.in/department-of-mechanical-engineering/faculty-mech/",
    "https://walchandsangli.ac.in/department-of-mechanical-engineering/achievements-mech/",
    # D. Information Technology Department
    "https://walchandsangli.ac.in/department-of-information-technology/overview-it/",
    "https://walchandsangli.ac.in/department-of-information-technology/b-tech-curriculum-with-minors-it/",
    "https://walchandsangli.ac.in/department-of-information-technology/m-tech-specialisations-and-curriculum-it/",
    "https://walchandsangli.ac.in/department-of-information-technology/academic-planning-activities-it/",
    "https://walchandsangli.ac.in/department-of-information-technology/resources-it/",
    "https://walchandsangli.ac.in/department-of-information-technology/faculty-it/",
    "https://walchandsangli.ac.in/department-of-information-technology/students-development-it/",
    # E. Computer Engineering Department
    "https://walchandsangli.ac.in/department-of-computer-engineering/overview/",
    "https://walchandsangli.ac.in/department-of-computer-engineering/b-tech-curriculum/",
    "https://walchandsangli.ac.in/department-of-computer-engineering/faculty/",
]

# Placement / Career Development Cell pages discovered via official homepage links
PLACEMENT_URLS = [
    "https://walchandsangli.ac.in/student-careers/career-development-cell/placement-in-wce/",
    "https://walchandsangli.ac.in/student-careers/career-development-cell/trainings/",
    "https://walchandsangli.ac.in/student-careers/career-development-cell/internships/",
    "https://walchandsangli.ac.in/student-careers/career-development-cell/higher-education/",
]

def get_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

def generate_doc_id(url: str, section: str = "") -> str:
    seed = f"{url}#{section}" if section else url
    h = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]
    return f"wce_{h}"

def sanitize_filename(url: str) -> str:
    path = urlparse(url).path.strip("/").replace("/", "_")
    return (path or "homepage") + ".html"

def detect_department(url: str, text: str) -> str:
    url_lower = url.lower()
    text_lower = text[:1000].lower()
    if "information-technology" in url_lower or "information technology" in text_lower or "overview-it" in url_lower:
        return "Information Technology"
    if "mechanical-engineering" in url_lower or "mechanical engineering" in text_lower:
        return "Mechanical Engineering"
    if "computer-engineering" in url_lower or "computer science and engineering" in text_lower or "cse" in text_lower:
        return "Computer Engineering"
    if "admission" in url_lower:
        return "Admissions"
    if "career" in url_lower or "placement" in url_lower:
        return "Training & Placement"
    return "Institutional"

def detect_category(url: str) -> str:
    url_lower = url.lower()
    if "admission" in url_lower:
        return "admissions"
    if "faculty" in url_lower:
        return "faculty"
    if "curriculum" in url_lower:
        return "curriculum"
    if "achievements" in url_lower:
        return "achievements"
    if "overview" in url_lower or url.rstrip("/") == "https://walchandsangli.ac.in":
        return "overview"
    if "resources" in url_lower:
        return "resources"
    if "student" in url_lower or "activities" in url_lower:
        return "student_development"
    if "placement" in url_lower or "training" in url_lower or "internship" in url_lower or "career" in url_lower:
        return "placement"
    return "general"

def extract_table_data(table):
    """
    Extracts table into both Markdown format and structured row records.
    """
    rows = table.find_all("tr")
    if not rows:
        return "", []

    all_row_data = []
    for r in rows:
        cells = [c.get_text(" ", strip=True) for c in r.find_all(["th", "td"])]
        if any(cells):
            all_row_data.append(cells)

    if not all_row_data:
        return "", []

    headers = all_row_data[0]
    data_rows = all_row_data[1:] if len(all_row_data) > 1 else []

    # Format markdown table
    md_lines = []
    md_lines.append("| " + " | ".join(headers) + " |")
    md_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
    for r in data_rows:
        # pad or truncate row to header length
        padded_row = r + [""] * (len(headers) - len(r))
        padded_row = padded_row[:len(headers)]
        md_lines.append("| " + " | ".join(padded_row) + " |")

    # Format structured rows
    structured_rows = []
    for r in data_rows:
        row_dict = {}
        for idx, col in enumerate(headers):
            val = r[idx] if idx < len(r) else ""
            row_dict[col] = val
        structured_rows.append(row_dict)

    return "\n".join(md_lines), structured_rows

def parse_html_page(html: str, url: str):
    soup = BeautifulSoup(html, "html.parser")

    # 1. Page Title
    title_el = soup.find("title")
    raw_title = title_el.text.strip() if title_el else ""
    page_title = re.sub(r"\s*[-–|•]\s*Walchand College of Engineering.*$", "", raw_title, flags=re.I).strip()
    if not page_title:
        h1 = soup.find("h1")
        page_title = h1.text.strip() if h1 else "WCE Document"

    # 2. Collect Links and PDFs
    discovered_links = []
    discovered_pdfs = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        full_url = urljoin(url, href)
        if full_url.lower().endswith(".pdf") or ".pdf?" in full_url.lower():
            discovered_pdfs.append(full_url)
        elif "walchandsangli.ac.in" in full_url:
            discovered_links.append(full_url)

    discovered_links = list(dict.fromkeys(discovered_links))
    discovered_pdfs = list(dict.fromkeys(discovered_pdfs))

    # 3. Collect Headings
    headings = []
    for h in soup.find_all(["h1", "h2", "h3", "h4"]):
        ht = h.get_text(" ", strip=True)
        if ht and len(ht) > 2 and ht not in headings:
            # Skip footer/menu boilerplate headings
            if ht.lower() in ["quick links", "get in touch", "join our newsletter", "menu"]:
                continue
            headings.append(ht)

    # 4. Remove boilerplate elements
    for selector in [
        "header", "footer", "nav", ".site-header", ".site-footer",
        ".elementor-location-header", ".elementor-location-footer",
        ".footer-widgets", ".copyright", "#header", "#footer", "#nav",
        "script", "style", "noscript", "svg", "form"
    ]:
        for el in soup.select(selector):
            el.decompose()

    # 5. Extract Tables
    tables_md = []
    faculty_records = []
    curriculum_records = []
    admission_records = []
    placement_records = []

    for t in soup.find_all("table"):
        table_md, rows_data = extract_table_data(t)
        if table_md:
            tables_md.append(table_md)

        # Inspect if table contains faculty
        headers_str = " ".join([k.lower() for r in rows_data for k in r.keys()])
        if any(w in headers_str for w in ["faculty", "cadre", "qualification", "experience"]):
            for r in rows_data:
                name = r.get("Name of Faculty") or r.get("Name") or ""
                cadre = r.get("Cadre") or ""
                pos = r.get("Administrative Position") or ""
                qual = r.get("Qualification") or ""
                exp = r.get("Experience (in years)") or r.get("Experience") or ""
                if name:
                    faculty_records.append({
                        "name": name,
                        "cadre": cadre,
                        "administrative_position": pos,
                        "qualification": qual,
                        "experience": exp,
                    })

        # Inspect if table contains curriculum / courses
        elif any(w in headers_str for w in ["course code", "course name", "track", "offering dept"]):
            for r in rows_data:
                c_code = r.get("Course Code") or ""
                c_name = r.get("Course Name") or ""
                category = r.get("Category") or r.get("Track") or ""
                if c_name or c_code:
                    curriculum_records.append({
                        "course_code": c_code,
                        "course_name": c_name,
                        "category": category,
                        "details": r,
                    })

        # Inspect if table contains admissions intake / fee
        elif any(w in headers_str for w in ["intake", "quota", "fees", "cap"]):
            for r in rows_data:
                admission_records.append(r)

        # Inspect if table contains placement statistics / functions
        elif any(w in headers_str for w in ["offers", "funcion", "function", "recruiters", "salary", "package"]):
            for r in rows_data:
                placement_records.append(r)

        t.replace_with(f"\n\n[TABLE]\n{table_md}\n[/TABLE]\n\n")

    # 6. Extract main text paragraphs and lists
    text_blocks = []
    for el in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote"]):
        txt = el.get_text(" ", strip=True)
        if not txt:
            continue
        # Avoid duplicate parent-child text
        if el.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
            text_blocks.append(f"\n### {txt}\n")
        elif el.name == "li":
            text_blocks.append(f"- {txt}")
        else:
            text_blocks.append(txt)

    full_text = "\n\n".join(text_blocks)
    full_text = re.sub(r"\n{3,}", "\n\n", full_text).strip()

    dept = detect_department(url, full_text)
    category = detect_category(url)

    return {
        "page_title": page_title,
        "department": dept,
        "category": category,
        "headings": headings,
        "content": full_text,
        "tables_md": tables_md,
        "faculty_records": faculty_records,
        "curriculum_records": curriculum_records,
        "admission_records": admission_records,
        "placement_records": placement_records,
        "discovered_links": discovered_links,
        "discovered_pdfs": discovered_pdfs,
    }

def fetch_page(url: str, max_retries: int = 3, delay: float = 0.5):
    ctx = get_ssl_context()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    last_error = None
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            start_t = time.time()
            with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
                elapsed = time.time() - start_t
                raw_bytes = resp.read()
                html = raw_bytes.decode("utf-8", errors="ignore")
                return {
                    "url": url,
                    "final_url": resp.geturl(),
                    "status_code": resp.status,
                    "elapsed_sec": round(elapsed, 3),
                    "size_bytes": len(raw_bytes),
                    "html": html,
                    "error": None,
                }
        except Exception as e:
            last_error = str(e)
            time.sleep(delay * (attempt + 1))

    return {
        "url": url,
        "final_url": None,
        "status_code": 0,
        "elapsed_sec": 0,
        "size_bytes": 0,
        "html": "",
        "error": last_error,
    }

def scrape_wce_knowledge_base(force_refetch: bool = False):
    """
    Crawls all 20 verified target URLs and placement pages.
    """
    RAW_WEBSITE_DIR.mkdir(parents=True, exist_ok=True)
    all_urls = list(dict.fromkeys(TARGET_URLS + PLACEMENT_URLS))

    results = []
    crawl_logs = []

    print(f"Starting crawl for {len(all_urls)} URLs (20 official targets + {len(PLACEMENT_URLS)} placement pages)...")

    for idx, url in enumerate(all_urls, 1):
        file_name = sanitize_filename(url)
        raw_path = RAW_WEBSITE_DIR / file_name

        if not force_refetch and raw_path.exists() and raw_path.stat().st_size > 1000:
            print(f"[{idx:02d}/{len(all_urls):02d}] Using cached raw HTML: {file_name}")
            with open(raw_path, "r", encoding="utf-8", errors="ignore") as f:
                html_content = f.read()
            fetch_res = {
                "url": url,
                "final_url": url,
                "status_code": 200,
                "elapsed_sec": 0.01,
                "size_bytes": len(html_content),
                "html": html_content,
                "error": None,
            }
        else:
            print(f"[{idx:02d}/{len(all_urls):02d}] Fetching live: {url} ...")
            fetch_res = fetch_page(url)
            if fetch_res["html"]:
                with open(raw_path, "w", encoding="utf-8") as f:
                    f.write(fetch_res["html"])

        crawl_logs.append({
            "target_url": url,
            "final_url": fetch_res["final_url"],
            "status_code": fetch_res["status_code"],
            "redirected": fetch_res["final_url"] != url if fetch_res["final_url"] else False,
            "elapsed_sec": fetch_res["elapsed_sec"],
            "size_bytes": fetch_res["size_bytes"],
            "error": fetch_res["error"],
        })

        if fetch_res["html"]:
            # Parse content
            parsed = parse_html_page(fetch_res["html"], url)

            doc = {
                "document_id": generate_doc_id(url),
                "page_title": parsed["page_title"],
                "title": parsed["page_title"],
                "department": parsed["department"],
                "category": parsed["category"],
                "section": parsed["category"],
                "content": parsed["content"],
                "extracted_text": parsed["content"],
                "source_type": "website",
                "source_url": url,
                "source_title": parsed["page_title"],
                "extraction_date": "2026-11-01",
                "verification_status": "official_crawled",
                "headings": parsed["headings"],
                "tables_count": len(parsed["tables_md"]),
                "faculty_records": parsed["faculty_records"],
                "curriculum_records": parsed["curriculum_records"],
                "admission_records": parsed["admission_records"],
                "placement_records": parsed["placement_records"],
                "discovered_links": parsed["discovered_links"],
                "discovered_pdfs": parsed["discovered_pdfs"],
            }
            results.append(doc)
            print(f"    [OK] Extracted '{parsed['page_title']}' ({len(parsed['content'])} chars, {len(parsed['tables_md'])} tables, {len(parsed['faculty_records'])} faculty)")
        else:
            print(f"    [FAIL] {url} (Error: {fetch_res['error']})")

        time.sleep(0.4)

    return results, crawl_logs

if __name__ == "__main__":
    docs, logs = scrape_wce_knowledge_base()
    print(f"\nScraping complete. Processed {len(docs)} documents successfully.")
