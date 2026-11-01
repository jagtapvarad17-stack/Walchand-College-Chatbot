"""
WCE Retrieval Evaluation Suite
Runs automated retrieval tests across all key campus areas:
- Institutional & Homepage
- Admissions (First-year, PIO/OCI/FN/CIWG/NRI, Direct Second-year, Working Professionals)
- IT Department (Current HOD Dr. U. B. Chavan, Vision, Curriculum, Faculty, Resources)
- Mechanical Engineering (Overview, Curriculum, Faculty, Achievements)
- Computer Engineering (Overview, Curriculum, Faculty)
- Placement & Career Development Cell
- Authoritative Overrides & Historical Distinction
"""

import json
import subprocess
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
RETRIEVER_TEST_JS = BACKEND_DIR / "rag" / "testQuery.js"

TEST_QUERIES = [
    # Mandatory Accuracy Tests
    {
        "query": "Who is the current Head of the Information Technology Department?",
        "expected_keywords": ["U. B. Chavan", "Dr. Umesh B. Chavan", "Dr. U. B. Chavan"],
        "forbidden_keywords": ["Dr. R. R. Rathod as the current Head"],
        "category": "Mandatory IT HOD"
    },
    {
        "query": "Who leads the IT department at Walchand?",
        "expected_keywords": ["Chavan", "Head of Department"],
        "category": "Mandatory IT HOD Variant"
    },
    {
        "query": "Tell me about faculty member Dr. R. R. Rathod.",
        "expected_keywords": ["Rathod", "Assistant Professor", "Ph.D."],
        "category": "Dr. R. R. Rathod Profile Preservation"
    },
    # Admissions
    {
        "query": "What are the first-year B.Tech admission options and procedures?",
        "expected_keywords": ["BTech", "CAP", "CET", "intake"],
        "category": "Admissions First Year"
    },
    {
        "query": "What are the admission rules for PIO, OCI, FN, CIWG, and NRI students?",
        "expected_keywords": ["PIO", "OCI", "NRI", "CIWG"],
        "category": "Admissions International"
    },
    {
        "query": "What are the admission pathways for direct second year B.Tech and working professionals?",
        "expected_keywords": ["Direct Second Year", "working professionals"],
        "category": "Admissions DSE"
    },
    # Mechanical Engineering
    {
        "query": "What is the Mechanical Engineering Department overview and objectives?",
        "expected_keywords": ["Mechanical Engineering", "Vision", "Mission"],
        "category": "Mechanical Overview"
    },
    {
        "query": "Who are the faculty members in the Mechanical Engineering Department?",
        "expected_keywords": ["Professor", "Faculty", "Mechanical"],
        "category": "Mechanical Faculty"
    },
    # Computer Engineering
    {
        "query": "What is the Computer Engineering Department overview?",
        "expected_keywords": ["Computer Science", "Engineering", "Overview"],
        "category": "Computer Engineering Overview"
    },
    {
        "query": "Who are the Computer Engineering faculty members?",
        "expected_keywords": ["Faculty", "Computer"],
        "category": "Computer Engineering Faculty"
    },
    # Placement
    {
        "query": "What placement statistics, top recruiters, and functions are listed for WCE?",
        "expected_keywords": ["Placement", "Recruiters", "Offers"],
        "category": "Placements"
    }
]

def run_retrieval_tests():
    # Helper to test via node retriever
    script_path = BACKEND_DIR / "tests" / "evaluateRetrieval.js"
    res = subprocess.run(["node", str(script_path)], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)
    return res.returncode == 0

if __name__ == "__main__":
    run_retrieval_tests()

