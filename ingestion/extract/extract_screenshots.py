"""
WCE Screenshot Extraction Module
Processes physical screenshot image files from ingestion/sources/screenshots/.
If no image files are physically available in the directory, records that they
need to be copied into the screenshot ingestion directory without fabricating data.
"""

import os
import glob
from pathlib import Path

SCREENSHOTS_DIR = Path(__file__).resolve().parent.parent / "sources" / "screenshots"

def extract_screenshots(directory=None):
    target_dir = Path(directory) if directory else SCREENSHOTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Supported image extensions
    image_extensions = ("*.png", "*.jpg", "*.jpeg", "*.webp", "*.bmp", "*.tiff")
    image_files = []
    for ext in image_extensions:
        image_files.extend(list(target_dir.glob(ext)))
    
    report = {
        "directory": str(target_dir),
        "found_images_count": len(image_files),
        "files": [f.name for f in image_files],
        "extracted_documents": [],
        "status": "ready" if image_files else "no_screenshot_images_found",
        "message": (
            f"Found {len(image_files)} screenshot images to extract."
            if image_files
            else "No screenshot image files physically available in repository. Screenshots need to be copied into ingestion/sources/screenshots/ directory."
        )
    }
    
    if not image_files:
        return [], report

    # If image files exist, attempt extraction
    extracted_docs = []
    ocr_available = False
    try:
        import pytesseract
        from PIL import Image
        ocr_available = True
    except ImportError:
        ocr_available = False

    for img_path in image_files:
        doc_name = img_path.stem
        if ocr_available:
            try:
                from PIL import Image
                img = Image.open(img_path)
                text = pytesseract.image_to_string(img)
                extracted_docs.append({
                    "document_id": f"screenshot_{doc_name}",
                    "page_title": f"Screenshot: {doc_name}",
                    "title": f"Screenshot: {doc_name}",
                    "department": "Institutional",
                    "category": "screenshot",
                    "section": "screenshot_ocr",
                    "content": text.strip(),
                    "extracted_text": text.strip(),
                    "source_type": "screenshot",
                    "source_url": None,
                    "source_title": f"Website Screenshot - {doc_name}",
                    "extraction_date": "2026-11-01",
                    "verification_status": "screenshot_extracted"
                })
            except Exception as e:
                report["message"] += f" Failed to OCR {img_path.name}: {e}."
        else:
            report["message"] += f" OCR tool not available to extract text from {img_path.name}."

    report["extracted_documents"] = extracted_docs
    return extracted_docs, report

if __name__ == "__main__":
    docs, rep = extract_screenshots()
    print("Report:", rep)

