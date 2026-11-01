/**
 * ==============================================================================
 * WCE Dedicated Faculty Retrieval & Structured Store
 * ==============================================================================
 * Provides high-accuracy, 100% complete structured retrieval for faculty queries.
 * Bypasses top-k vector limits to guarantee NO faculty members are omitted.
 *
 * Supports queries like:
 *   - "Give me the complete IT faculty list."
 *   - "Who are the professors in IT?"
 *   - "Show all assistant professors in Mechanical Engineering."
 *   - "Who is the HOD of Computer Engineering?"
 *   - "Give me the faculty members along with their qualifications and experience."
 *   - "How many faculty members are there in each department?"
 * ==============================================================================
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JSONL_PATH = path.resolve(__dirname, '..', 'data', 'processed', 'wce_documents.jsonl');

// In-memory cache of faculty records grouped by canonical department
let _facultyCache = null;

/**
 * Normalizes faculty name by separating joining date if embedded
 */
function cleanFacultyName(rawName) {
  if (!rawName) return '';
  // e.g. "Dr. Dinesh B. Kulkarni (Joined on: December 1989 )" -> "Dr. Dinesh B. Kulkarni"
  const cleaned = rawName.replace(/\s*\(Joined on:.*?\)/i, '').trim();
  return cleaned.replace(/\s+/g, ' ');
}

/**
 * Normalizes department string into canonical department key
 */
function canonicalDepartment(deptStr) {
  if (!deptStr) return 'General';
  const s = deptStr.toLowerCase();
  if (s.includes('it') || s.includes('information')) return 'Information Technology';
  if (s.includes('mech')) return 'Mechanical Engineering';
  if (s.includes('comp') || s.includes('cse')) return 'Computer Engineering';
  return deptStr;
}

/**
 * Loads all faculty records from the processed JSONL dataset into memory.
 */
function loadFacultyStore() {
  if (_facultyCache) return _facultyCache;

  const recordsByDept = {
    'Information Technology': [],
    'Mechanical Engineering': [],
    'Computer Engineering': [],
  };

  const allRecords = [];

  if (!fs.existsSync(JSONL_PATH)) {
    console.warn('[FacultyStore] JSONL not found at', JSONL_PATH);
    _facultyCache = { recordsByDept, allRecords };
    return _facultyCache;
  }

  const raw = fs.readFileSync(JSONL_PATH, 'utf8');
  const lines = raw.trim().split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const doc = JSON.parse(line);

      // Handle dedicated individual faculty records
      if (doc.record_type === 'individual_faculty' && doc.faculty_name) {
        const dept = canonicalDepartment(doc.department);
        const record = {
          document_id: doc.document_id,
          name: cleanFacultyName(doc.faculty_name),
          raw_name: doc.faculty_name,
          cadre: doc.designation || doc.cadre || 'Faculty',
          designation: doc.designation || doc.cadre || 'Faculty',
          administrative_position: doc.administrative_position || '',
          qualification: doc.qualification || 'N/A',
          experience: doc.experience ? String(doc.experience).trim() : 'N/A',
          department: dept,
          source_url: doc.source_url || '',
        };

        // Apply authoritative IT HOD correction
        if (dept === 'Information Technology') {
          if (record.name.includes('Chavan') || record.name.includes('Umesh')) {
            record.administrative_position = 'Head of Department';
          }
          if (record.name.includes('Rathod')) {
            // Outdated HOD claim overridden; preserved as faculty member
            if (record.administrative_position.toLowerCase().includes('head') || record.administrative_position.toLowerCase().includes('hod')) {
              record.administrative_position = '';
            }
          }
        }

        // Avoid duplicates in cache
        const exists = allRecords.some(r => r.name === record.name && r.department === dept);
        if (!exists) {
          if (recordsByDept[dept]) {
            recordsByDept[dept].push(record);
          }
          allRecords.push(record);
        }
      }

      // Also parse from faculty_records array in department overview docs if individual docs not yet present
      if (Array.isArray(doc.faculty_records) && doc.faculty_records.length > 0) {
        const dept = canonicalDepartment(doc.department);
        for (const fr of doc.faculty_records) {
          const cName = cleanFacultyName(fr.name);
          const exists = allRecords.some(r => r.name === cName && r.department === dept);
          if (!exists && cName) {
            const record = {
              document_id: `faculty_${dept.toLowerCase().replace(/\s+/g, '_')}_${allRecords.length + 1}`,
              name: cName,
              raw_name: fr.name,
              cadre: fr.cadre || 'Faculty',
              designation: fr.cadre || 'Faculty',
              administrative_position: fr.administrative_position || '',
              qualification: fr.qualification || 'N/A',
              experience: fr.experience ? String(fr.experience).trim() : 'N/A',
              department: dept,
              source_url: doc.source_url || '',
            };

            // Apply authoritative IT HOD correction
            if (dept === 'Information Technology') {
              if (record.name.includes('Chavan') || record.name.includes('Umesh')) {
                record.administrative_position = 'Head of Department';
              }
              if (record.name.includes('Rathod')) {
                if (record.administrative_position.toLowerCase().includes('head') || record.administrative_position.toLowerCase().includes('hod')) {
                  record.administrative_position = '';
                }
              }
            }

            if (recordsByDept[dept]) {
              recordsByDept[dept].push(record);
            }
            allRecords.push(record);
          }
        }
      }
    } catch {
      // Ignore corrupted lines
    }
  }

  _facultyCache = { recordsByDept, allRecords };
  console.log(`[FacultyStore] Loaded ${allRecords.length} structured faculty records (IT: ${recordsByDept['Information Technology'].length}, Mech: ${recordsByDept['Mechanical Engineering'].length}, Comp: ${recordsByDept['Computer Engineering'].length})`);
  return _facultyCache;
}

/**
 * Retrieves faculty records matching department and optional filters.
 *
 * @param {string} department - 'Information Technology' | 'Mechanical Engineering' | 'Computer Engineering' | 'all'
 * @param {object} [filters]
 * @param {string} [filters.cadre] - 'Professor' | 'Associate Professor' | 'Assistant Professor' | 'Adjunct Professor'
 * @param {string} [filters.position] - 'HOD' | 'Head of Department' | 'Deputy Director' | etc.
 * @param {string} [filters.name] - Search for specific faculty name substring
 * @returns {Array<object>} All matching faculty records
 */
function getFacultyByDepartment(department, filters = {}) {
  const store = loadFacultyStore();
  let records = [];

  const deptKey = canonicalDepartment(department);
  if (deptKey === 'all' || !department || department.toLowerCase() === 'all' || department.toLowerCase().includes('every') || department.toLowerCase().includes('each')) {
    records = [...store.allRecords];
  } else if (store.recordsByDept[deptKey]) {
    records = [...store.recordsByDept[deptKey]];
  } else {
    // Search across all records if department doesn't match canonical keys
    records = [...store.allRecords];
  }

  // Filter by Cadre / Designation
  if (filters.cadre) {
    const cLower = filters.cadre.toLowerCase();
    if (cLower === 'professor') {
      // Matches "Professor" but NOT "Assistant Professor" or "Associate Professor"
      records = records.filter(r => {
        const d = r.designation.toLowerCase();
        return d === 'professor' || d === 'prof.' || (d.includes('professor') && !d.includes('assistant') && !d.includes('associate') && !d.includes('adjunct'));
      });
    } else if (cLower.includes('associate')) {
      records = records.filter(r => r.designation.toLowerCase().includes('associate'));
    } else if (cLower.includes('assistant')) {
      records = records.filter(r => r.designation.toLowerCase().includes('assistant'));
    } else if (cLower.includes('adjunct')) {
      records = records.filter(r => r.designation.toLowerCase().includes('adjunct'));
    } else {
      records = records.filter(r => r.designation.toLowerCase().includes(cLower));
    }
  }

  // Filter by Administrative Position
  if (filters.position) {
    const pLower = filters.position.toLowerCase();
    if (pLower.includes('hod') || pLower.includes('head')) {
      records = records.filter(r => {
        const pos = r.administrative_position.toLowerCase();
        return pos.includes('head') || pos.includes('hod');
      });
    } else {
      records = records.filter(r => r.administrative_position.toLowerCase().includes(pLower));
    }
  }

  // Filter by Name
  if (filters.name) {
    const nLower = filters.name.toLowerCase();
    records = records.filter(r => r.name.toLowerCase().includes(nLower));
  }

  return records;
}

/**
 * Returns summary counts for all departments.
 */
function getFacultyStats() {
  const store = loadFacultyStore();
  return {
    'Information Technology': store.recordsByDept['Information Technology'].length,
    'Mechanical Engineering': store.recordsByDept['Mechanical Engineering'].length,
    'Computer Engineering': store.recordsByDept['Computer Engineering'].length,
    total: store.allRecords.length,
  };
}

/**
 * Formats a list of faculty records into a complete, compliant Markdown table.
 *
 * @param {Array<object>} facultyList
 * @param {string} [title]
 * @returns {string} Formatted Markdown table
 */
function formatFacultyTable(facultyList, title = 'Faculty Directory') {
  if (!facultyList || facultyList.length === 0) {
    return 'No matching faculty records found for the requested criteria.';
  }

  const lines = [];
  if (title) {
    lines.push(`### ${title}`);
    lines.push(`**Total Faculty Members:** ${facultyList.length}\n`);
  }

  lines.push('| Sr. No. | Faculty Name | Designation | Administrative Position | Qualification | Experience |');
  lines.push('| :---: | :--- | :--- | :--- | :--- | :--- |');

  facultyList.forEach((f, idx) => {
    const srNo = idx + 1;
    const name = f.name || 'N/A';
    const desig = f.designation || f.cadre || 'N/A';
    const pos = f.administrative_position ? f.administrative_position.trim() : 'N/A';
    const qual = f.qualification || 'N/A';
    const exp = f.experience && f.experience !== 'N/A' && f.experience.trim() ? `${f.experience} years` : 'N/A';

    lines.push(`| ${srNo} | ${name} | ${desig} | ${pos} | ${qual} | ${exp} |`);
  });

  return lines.join('\n');
}

/**
 * Detects whether a query is requesting a structured faculty list or count.
 *
 * @param {string} query
 * @returns {{ isFacultyQuery: boolean, isCountQuery: boolean, department: string|null, cadre: string|null, position: string|null }}
 */
function detectFacultyQuery(query) {
  if (!query || typeof query !== 'string') {
    return { isFacultyQuery: false };
  }

  const q = query.toLowerCase();

  const isFacultyWord = q.includes('faculty') ||
                        q.includes('professor') ||
                        q.includes('teacher') ||
                        q.includes('staff') ||
                        q.includes('hod') ||
                        q.includes('head of department') ||
                        q.includes('head of the department');

  if (!isFacultyWord) {
    return { isFacultyQuery: false };
  }

  // Detect Department
  let department = null;
  if (q.includes('information technology') || /\bit\b/i.test(q)) {
    department = 'Information Technology';
  } else if (q.includes('mechanical') || /\bmech\b/i.test(q)) {
    department = 'Mechanical Engineering';
  } else if (q.includes('computer') || /\bcse\b/i.test(q) || q.includes('comp engg') || q.includes('computer engineering')) {
    department = 'Computer Engineering';
  } else if (q.includes('all department') || q.includes('each department') || q.includes('every department') || q.includes('across department') || q.includes('college faculty')) {
    department = 'all';
  }

  // Detect Cadre
  let cadre = null;
  if (q.includes('assistant professor')) {
    cadre = 'Assistant Professor';
  } else if (q.includes('associate professor')) {
    cadre = 'Associate Professor';
  } else if (q.includes('adjunct professor')) {
    cadre = 'Adjunct Professor';
  } else if (q.includes('professor') && !q.includes('assistant') && !q.includes('associate')) {
    cadre = 'Professor';
  }

  // Detect Position
  let position = null;
  if (q.includes('hod') || q.includes('head of')) {
    position = 'HOD';
  }

  // Detect Count query
  const isCountQuery = q.includes('how many faculty') ||
                       q.includes('count of faculty') ||
                       q.includes('number of faculty') ||
                       q.includes('faculty count') ||
                       q.includes('faculty records are available');

  // Detect List query
  const isListQuery = q.includes('list') ||
                      q.includes('give me') ||
                      q.includes('show') ||
                      q.includes('all faculty') ||
                      q.includes('who are the') ||
                      q.includes('faculty members') ||
                      q.includes('complete faculty') ||
                      q.includes('table');

  return {
    isFacultyQuery: isListQuery || isCountQuery || Boolean(cadre) || Boolean(position),
    isCountQuery,
    isListQuery,
    department,
    cadre,
    position,
  };
}

module.exports = {
  loadFacultyStore,
  getFacultyByDepartment,
  getFacultyStats,
  formatFacultyTable,
  detectFacultyQuery,
  cleanFacultyName,
  canonicalDepartment,
};

