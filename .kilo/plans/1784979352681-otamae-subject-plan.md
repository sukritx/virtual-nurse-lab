# Add "Otamae" Subject with 10 Labs

## Goal
Add a new subject "Otamae" (10 labs, the 10 scenarios provided) following the exact per-subject pattern used by Fundamental/Surgical/Medical/OB in the VNL2025 module.

## Context (how the existing pattern works)
- `LabInfo` docs identify a lab by `{ labNumber, subject }` (backend/db.js). `LabSubmission` stores attempts with auto-increment attempt number; pass = `totalScore >= 60`; `MAX_ATTEMPTS = 3`.
- Recording: frontend posts chunks to `POST /api/v1/vnl2025/upload-chunk`, then `POST /api/v1/vnl2025/<subject>/<N>` with `{ fileName, totalChunks, language }`. Backend reassembles the file, uploads to Spaces, extracts audio, transcribes (ElevenLabs scribe_v2 with OpenAI Whisper fallback — both multilingual, no change needed for Japanese), grades against a hardcoded bilingual answer key via OpenAI JSON output, then posts the result to `POST /api/v1/lab-deployed/submit-lab` (`backend/routes/vnl-2025-lab-backend.js:217`).
- Student dashboard data: `GET /api/v1/student/<subject>/labs` (backend/routes/student.js). History is generic: `GET /api/v1/student/:subject/:labNumber/history` (student.js:38) — works for `otamae` with no changes.
- Professor: `GET /api/v1/professor/<subject>/labs`, `/professor/student/:userId/<subject>/labs`, `/professor/student/:userId/lab/<subject>/:labNumber` (professor.js), plus CSV via `/professor/download-scores` which maps `universityCode` prefix → subject (SUR/MED/OB/FUN).
- Login/signup redirect by `universityCode` prefix in frontend/src/pages/Signin.jsx and Signup.jsx.
- Frontend per subject: 1 recording component + N lab page components (`components/VNL-2025/fundamental-*.jsx`), 5 pages (`pages/VNL2025/Fundamental*.jsx`), routes in App.jsx.

## Confirmed decisions
1. Name "Otamae": DB subject key `otamae`, universityCode prefix `OTA`, display name "Otamae".
2. 10 labs numbered 1–10 (the 10 scenarios).
3. Languages: Japanese default + in-page English toggle (single route per lab, no `/en` routes). Backend receives `language: 'ja' | 'en'` and grades with matching Japanese/English rubric.
4. Scoring: unchanged engine — per-item rubric points, `totalScore` capped at 100, pass ≥ 60, 3 attempts. No +25% allowance math; optionally add one leniency line about transcription errors to the grading prompt.
5. Recording limit stays 180 s (`MAX_RECORDING_TIME`).
6. Scenario 2 Q3② MCQ stays a voice-graded rubric item (25 pts, correct answer B).
7. New backend file `backend/routes/otamae-lab-backend.js` mounted at `/api/v1/vnl2025` (URLs: `/api/v1/vnl2025/otamae/N`); `upload-chunk` stays on the existing router (distinct paths, no conflict).

## Tasks (ordered)

### Backend
1. **Create `backend/routes/otamae-answer-keys.js`** — data module exporting `const otamaeAnswerKeys = { 1: { ja, en }, …, 10: { ja, en } }`. Encode the 10 provided rubrics verbatim (key-answer items + `(N points)` per item, section subtotals, TOTAL 100). Scenario 2 includes the MCQ item ("Correct answer B: check mask fit and oxygen flow rate, then report to the physician — 25 points"). Append the "Voice-error allowance +20–30% … Pass ≥ 60%" line as a plain context note in each rubric (no functional effect). Preserve the provided bilingual (EN/JA) wording.
2. **Create `backend/routes/otamae-lab-backend.js`**:
   - Duplicate the small helpers from vnl-2025-lab-backend.js (getFileType, uploadToSpaces with LOCAL_DEV short-circuit, transcribeAudioElevenLabs + Whisper fallback) — codebase convention already duplicates these across route files (see lab-deployed.js).
   - One shared grader `evaluateOtamae(transcription, answerKey, language)`: reuse the existing English checkContentEN prompt verbatim; add a Japanese checkContentJA prompt (Japanese translation of the same instructions). Call `openai.chat.completions.create` with `gpt-4o`, `response_format: { type: "json_object" }`; parse and return `{ totalScore, pros, recommendations }`.
   - 10 routes `POST /otamae/1` … `POST /otamae/10` mirroring `POST /fundamental/N` exactly (chunk reassembly from `backend/temp`, Spaces key `otamae/labN/${req.userId}/<ts><ext>`, ffmpeg audio extraction for video, transcription, `language || 'ja'`, grading, then `axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', { subject: 'otamae', labNumber: N, … })`; response JSON identical to fundamental: `{ feedback, transcription, passFailStatus, score, pros, recommendations, fileUrl, fileType }`; `isPass: totalScore >= 60`).
3. **`backend/routes/index.js`** — require the new router and add `router.use("/vnl2025", otamaeRouter);` after the existing vnl2025 mount.
4. **`backend/routes/student.js`** — add `GET /otamae/labs` (copy of `/fundamental/labs` at lines 226–255, subject `'otamae'`).
5. **`backend/routes/professor.js`** — add:
   - `GET /otamae/labs` (copy `/fundamental/labs` at 996–1076)
   - `GET /student/:userId/otamae/labs` (copy 1078–1137)
   - `GET /student/:userId/lab/otamae/:labNumber` (copy 1139–1165)
   - In `/download-scores` (line ~232): add `else if (upperUniversityCode.startsWith("OTA")) subjectFilter = { subject: "otamae" };`
6. **Create `backend/seed-otamae-labs.js`** — copy seed-fundamental-labs.js; 10 idempotent `LabInfo` upserts `{ labName: 'Otamae Lab N', labNumber: N, subject: 'otamae' }`.

### Frontend
7. **Create `frontend/src/components/VNL-2025/OtamaeRecordingComponent.jsx`** — clone of FundamentalRecordingComponent.jsx with these changes only:
   - submit URL `/api/v1/vnl2025/otamae/${labNumber}`; file name prefix `otamae-${labNumber}_recording_...`
   - language select options: `ja` (日本語) default, `en` (English); NO route navigation on change (lab page component swaps text in place)
   - "Back to Dashboard" link → `/otamae/dashboard`
   - keep MAX_RECORDING_TIME = 180, chunked upload to `/api/v1/vnl2025/upload-chunk`, identical feedback UI.
8. **Create 10 lab page components `frontend/src/components/VNL-2025/otamae-1.jsx` … `otamae-10.jsx`** (clone fundamental-1.jsx pattern, no separate EN files):
   - Each holds the JA and EN scenario strings from the provided content (title, description = patient info/clinical data, `questions` array incl. the MCQ question for scenario 2).
   - `language` state default `'ja'`; passing `title/description/questions` for the active language to OtamaeRecordingComponent; fetch attempts from `/api/v1/student/otamae/labs` for its labNumber.
9. **Create 5 pages in `frontend/src/pages/VNL2025/`** (clones of Fundamental pages with endpoints swapped to `otamae` and lab range 1–10):
   - `OtamaeStudentDashboard.jsx` (GET `/api/v1/student/otamae/labs`, filter labNumber 1–10, navigate `/student/otamae/N`, history `/otamae/:labNumber/history`)
   - `OtamaeProfessorDashboard.jsx` (GET `/api/v1/professor/otamae/labs`, existing `/professor/download-scores`)
   - `OtamaeStudentLabs.jsx` (GET `/api/v1/professor/student/${userId}/otamae/labs`)
   - `OtamaeLabDetails.jsx` (GET `/api/v1/professor/student/${userId}/lab/otamae/${labNumber}`)
   - `OtamaeLabHistory.jsx` (GET `/api/v1/student/otamae/${labNumber}/history`)
10. **`frontend/src/App.jsx`** — imports + routes:
    - `/student/otamae/1` … `/student/otamae/10`
    - `/otamae/dashboard`, `/otamae/:labNumber/history`
    - `/professor/otamae/dashboard`, `/professor/otamae/view-labs/:userId`, `/professor/otamae/view-lab/:userId/:labNumber`
11. **`frontend/src/pages/Signin.jsx` and `Signup.jsx`** — add `OTA` prefix branch: professors → `/professor/otamae/dashboard`, students → `/otamae/dashboard`.

## Out of scope
- No DB schema/migration changes. No changes to Homepage/Dashboard subject listings (subjects are reached via signin redirect, as with existing subjects). No Thai language for Otamae. No videos provided → `videoSrc=""`.

## Risks
- New backend file is large (10 routes + 10 bilingual rubrics); answer keys isolated in `otamae-answer-keys.js` to keep the route file readable.
- Two routers on `/api/v1/vnl2025`: verify mount order in routes/index.js; paths are disjoint so no shadowing.
- Scenario 2 rubric has three sub-questions incl. an MCQ — encode the MCQ as a normal 25-point rubric item; the grader prompt handles it like any other item.
- Japanese transcription relies on ElevenLabs scribe_v2 / Whisper multilingual auto-detection (already in use, no code change).

## Validation
1. `node --check backend/routes/otamae-lab-backend.js` and `node --check backend/routes/otamae-answer-keys.js`.
2. `node backend/seed-otamae-labs.js` (needs MONGO_URI in .env); verify 10 LabInfo docs via Mongo/Atlas UI.
3. Start backend (`npm run dev` in backend) and frontend (`npm run dev` in frontend); create/sign in with an `OTA*` universityCode student → should land on `/otamae/dashboard` showing 10 labs.
4. Submit a lab-1 recording in Japanese and in English; verify feedback JSON, score, pass/fail, and submission row.
5. Verify history page, professor dashboard stats, per-student labs/details pages, and CSV download includes Score_01…Score_10.
6. `npm run lint` and `npm run build` in frontend.
