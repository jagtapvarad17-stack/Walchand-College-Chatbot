# WCE Website Screenshot Ingestion Directory

This directory is designated for website screenshots from the official WCE portal.

## Expected Screenshots
1. **WCE Homepage**: College introduction, institutional identity, achievements, alumni, placement highlights, academic programs, facilities, and history.
2. **IT Department Overview**: Introduction, establishment, programs, vision, mission, objectives, policy, strengths, areas of expertise, salient features, leadership profile.
3. **IT Department Faculty**: Faculty table containing faculty names, cadre, administrative positions, qualifications, experience.
4. **Mechanical Engineering Overview**: Introduction, academic info, objectives, research, facilities, strengths, leadership.
5. **Computer Science and Engineering Overview**: Introduction, history, programs, research, industry collaboration, strengths, student development, leadership.
6. **Placement in WCE**: Career Development Cell, placement procedure, statistics, recruiters, branch-wise placement, job functions, career counseling, internships, training.

## Ingestion Status
- If physical image files (`.png`, `.jpg`, `.jpeg`, `.webp`) are placed in this folder, `extract_screenshots.py` will process them using image text extraction / OCR.
- If this directory contains no image files, the crawler uses the exact live official URLs and internal links, and records in the ingestion report that physical screenshot images must be copied into this directory.

