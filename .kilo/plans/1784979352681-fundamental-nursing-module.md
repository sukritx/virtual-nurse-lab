# Fundamental Nursing (FUN) Module — Implementation Plan

## Overview

Add a new "Fundamental Nursing" subject (`FUN` register code prefix) with 3 labs in Thai and English, replicating the SUR/MED/OB structure. The backend uses the 100-point scoring system (same as SUR/MED/OB), ignoring the 120-cap from the spec docs.

---

## Files to Create

### Frontend — Components (7 new)

| # | File | Source to Copy | Changes |
|---|---|---|---|
| 1 | `frontend/src/components/VNL-2025/FundamentalRecordingComponent.jsx` | `SurgicalRecordingComponent.jsx` | Replace `surgical` → `fundamental` in 3 places: back-link `href`, file name prefix, API endpoint |
| 2 | `frontend/src/components/VNL-2025/fundamental-1.jsx` | `surgical-1.jsx` | Replace content with **Lab 1 TH** data (title, subtitle, description, questions, videoSrc) |
| 3 | `frontend/src/components/VNL-2025/fundamental-1en.jsx` | `surgical-1.jsx` | Replace content with **Lab 1 EN** data; import `FundamentalRecordingComponent` |
| 4 | `frontend/src/components/VNL-2025/fundamental-2.jsx` | `surgical-2.jsx` | Replace content with **Lab 2 TH** data |
| 5 | `frontend/src/components/VNL-2025/fundamental-2en.jsx` | `surgical-2.jsx` | Replace content with **Lab 2 EN** data |
| 6 | `frontend/src/components/VNL-2025/fundamental-3.jsx` | `surgical-3.jsx` | Replace content with **Lab 3 TH** data |
| 7 | `frontend/src/components/VNL-2025/fundamental-3en.jsx` | `surgical-3.jsx` | Replace content with **Lab 3 EN** data |

### Frontend — Pages (5 new)

| # | File | Source to Copy | Changes |
|---|---|---|---|
| 8 | `frontend/src/pages/VNL2025/FundamentalStudentDashboard.jsx` | `SurgicalStudentDashboard.jsx` | Replace all `surgical` → `fundamental`; API path `/api/v1/student/fundamental/labs`; heading "การพยาบาลพื้นฐาน" |
| 9 | `frontend/src/pages/VNL2025/FundamentalProfessorDashboard.jsx` | `SurgicalProfessorDashboard.jsx` | Replace `surgical` → `fundamental`; heading "Professor Fundamental Dashboard" |
| 10 | `frontend/src/pages/VNL2025/FundamentalStudentLabs.jsx` | `SurgicalStudentLabs.jsx` | Replace `surgical` → `fundamental`; API path + links |
| 11 | `frontend/src/pages/VNL2025/FundamentalLabDetails.jsx` | `SurgicalLabDetails.jsx` | Replace `surgical` → `fundamental`; API path |
| 12 | `frontend/src/pages/VNL2025/FundamentalLabHistory.jsx` | `SurgicalLabHistory.jsx` | Replace `surgical` → `fundamental`; API path |

### Frontend — Lab Content Mapping

**Note**: Videos are not yet available. All `videoSrc` fields should be set to `""` (empty string). The RecordingComponent should conditionally hide the video player section when `videoSrc` is falsy (`{videoSrc && <video ... />}`). When videos are provided later, place them in `frontend/public/fundamental/` and update the paths.

| Component | `title` (TH) | `subtitle` | `description` | `questions[]` | `videoSrc` |
|---|---|---|---|---|---|
| `fundamental-1.jsx` | from `fundamental-th` Scenario 1 header | `""` | Scenario script paragraphs (TH) | Q1 prompt + Q2 prompt | `""` |
| `fundamental-1en.jsx` | from `fundamental-en` Scenario 1 header | `""` | Scenario script paragraphs (EN) | Q1 prompt + Q2 prompt (EN) | `""` |
| `fundamental-2.jsx` | from `fundamental-th` Scenario 2 header | `""` | Scenario script paragraphs (TH) | Q1 prompt + Q2 prompt | `""` |
| `fundamental-2en.jsx` | from `fundamental-en` Scenario 2 header | `""` | Scenario script paragraphs (EN) | Q1 prompt + Q2 prompt (EN) | `""` |
| `fundamental-3.jsx` | from `fundamental-th` Scenario 3 header | `""` | Scenario script paragraphs (TH) | Q1 prompt + Q2 prompt | `""` |
| `fundamental-3en.jsx` | from `fundamental-en` Scenario 3 header | `""` | Scenario script paragraphs (EN) | Q1 prompt + Q2 prompt (EN) | `""` |

Each component's `handleLanguageChange` navigates between TH/EN routes:
- `th` → `/student/fundamental/{n}`
- `en` → `/student/fundamental/{n}en`

---

## Files to Modify

### Frontend — App.jsx

Add imports for all 12 new files, then add routes in 3 blocks:

**Student routes** (inside `<Route element={<PrivateRoute />}>` > `<Route element={<MainLayout />}>` — near existing VNL2025 routes):
```jsx
<Route path="/fundamental/dashboard" element={<FundamentalStudentDashboard />} />
<Route path="/student/fundamental/1" element={<Fundamental1 />} />
<Route path="/student/fundamental/1en" element={<Fundamental1En />} />
<Route path="/student/fundamental/2" element={<Fundamental2 />} />
<Route path="/student/fundamental/2en" element={<Fundamental2En />} />
<Route path="/student/fundamental/3" element={<Fundamental3 />} />
<Route path="/student/fundamental/3en" element={<Fundamental3En />} />
<Route path="/fundamental/:labNumber/history" element={<FundamentalLabHistory />} />
```

**Professor routes** (inside `<Route element={<PrivateRoute role="professor" />}>` > `<Route element={<MainLayout />}>`):
```jsx
<Route path="/professor/fundamental/dashboard" element={<FundamentalProfessorDashboard />} />
<Route path="/professor/fundamental/view-labs/:userId" element={<FundamentalStudentLabs />} />
<Route path="/professor/fundamental/view-lab/:userId/:labNumber" element={<FundamentalLabDetails />} />
```

### Frontend — Signin.jsx

In the `handleSignin` redirection logic (~line 24-101), add `"FUN"` checks in both professor and student blocks:

```jsx
// In professor block (~after line 58):
if (upperRegisterCode.startsWith("FUN")) {
  navigate("/professor/fundamental/dashboard");
  return;
}
// In student block (~after line 86):
if (upperRegisterCode.startsWith("FUN")) {
  navigate("/fundamental/dashboard");
  return;
}
```

### Frontend — Signup.jsx

Same additions in the `redirectUser` helper function (~lines 14-82).

### Frontend — Fix the existing SUR/MED/OB history route bug in App.jsx

The 3 routes at lines 184, 191, 198 all use `/:subject/:labNumber/history` — only the last one (`OBLabHistory`) works. Fix by making each unique:

```jsx
<Route path="/surgical/:labNumber/history" element={<SurgicalLabHistory />} />
<Route path="/medical/:labNumber/history" element={<MedicalLabHistory />} />
<Route path="/ob/:labNumber/history" element={<OBLabHistory />} />
```

*(Note: The existing `SurgicalLabHistory` / `MedicalLabHistory` / `OBLabHistory` components already use `useParams()` to read both `subject` and `labNumber`, so the route param name change from `/:subject/:labNumber` to `/:subject/:labNumber` is compatible — actually they use `/:subject/:labNumber/history` and the component destructures `const { subject, labNumber } = useParams()`. If we change to `surgical/:labNumber/history`, the component would get `subject` as `undefined`. We need to either hardcode the subject in each component or keep using dynamic params.*)

**Simpler fix**: Change the path patterns to use different prefixes:
```jsx
<Route path="/surgical/:labNumber/history" element={<SurgicalLabHistory />} />
<Route path="/medical/:labNumber/history" element={<MedicalLabHistory />} />
<Route path="/ob/:labNumber/history" element={<OBLabHistory />} />
```
AND in each component, hardcode the subject:
```jsx
// SurgicalLabHistory.jsx — replace dynamic subject with 'surgical'
const response = await axios.get(`/api/v1/student/surgical/${labNumber}/history`, ...)
```
*(This requires 3 small edits to existing components. Alternatively, add a `subject` prop or hardcode it per component.)*

For the new Fundamental history route:
```jsx
<Route path="/fundamental/:labNumber/history" element={<FundamentalLabHistory />} />
```
And in `FundamentalLabHistory.jsx`, hardcode the API path to `/api/v1/student/fundamental/${labNumber}/history`.

---

### Backend — vnl-2025-lab-backend.js

Add 3 route handlers + 3 processing functions at the end of the file (before or after the OB block):

**Routes** (each follows the exact same pattern as `router.post('/surgical/1', ...)`):
- `router.post('/fundamental/1', authMiddleware, ...)` → calls `processTranscriptionFundamentalLab1(transcription)`
- `router.post('/fundamental/2', authMiddleware, ...)` → calls `processTranscriptionFundamentalLab2(transcription)`
- `router.post('/fundamental/3', authMiddleware, ...)` → calls `processTranscriptionFundamentalLab3(transcription)`

Each route uses:
- Spaces upload path: `fundamental/lab{n}/{userId}/{timestamp}`
- Subject: `'fundamental'`
- Same chunk reassembly, transcription, submit-lab logic

**Processing functions** (each follows the same pattern as `processTranscriptionSurgicalLab1`):

| Function | TH answerKey source | EN answerKey source |
|---|---|---|
| `processTranscriptionFundamentalLab1(transcription)` | `fundamental-th` Scenario 1 — combine Q1 + Q2 rubric rows into narrative | `fundamental-en` Scenario 1 — combine Q1 + Q2 rubric rows into narrative |
| `processTranscriptionFundamentalLab2(transcription)` | `fundamental-th` Scenario 2 | `fundamental-en` Scenario 2 |
| `processTranscriptionFundamentalLab3(transcription)` | `fundamental-th` Scenario 3 | `fundamental-en` Scenario 3 |

**TH/EN switching strategy**: Since the user chose 100-point system, each `processTranscription` function will have TWO answer keys (TH + EN) and TWO `checkContent` prompts. Accept a `language` field from the request body (`req.body.language`). Select the appropriate key + prompt based on language. If no language provided, default to TH.

```
processTranscriptionFundamentalLab1(transcription, language = 'th')
  if language === 'en':
    answerKey = <EN answer key narrative>
    checkContent = <EN grading prompt>
  else:
    answerKey = <TH answer key narrative>
    checkContent = <TH grading prompt>
  → call OpenAI GPT-4o
  → return { totalScore, pros, recommendations }
```

**Answer key narrative format** (convert tabular rows to narrative):

For each scenario:
```
สถานการณ์:
[scenario text]

คำถาม:
[question text]

เฉลย:
1. [Concept description] (10)
2. [Concept description] (15)
   - [Sub-point if any] (5)
...

คำตอบ คะแนนเต็ม 100 คะแนน
```

Distribute the existing scoring points proportionally so they sum to 100 instead of 120. Simplest approach: keep the original weights but scale proportionally, or adjust specific items. Since the document says "total 120 points" but the user chose 100-point system, adjust the answer key so the listed point values sum to exactly 100.

**Alternative (simpler)**: Keep the 120-point distribution in the answer key but have GPT-4o score out of 120, then apply `min(100, totalScore)` on the backend before returning. This preserves the original rubric fidelity. Pass threshold stays at 60 (not 72).

The frontend `FundamentalRecordingComponent.jsx` sends `language: 'th'` or `'en'` as part of the POST body.

### Backend — student.js

Add after the `/ob/labs` endpoint (~line 223):
```js
// Fundamental nursing
router.get('/fundamental/labs', authMiddleware, async (req, res) => {
  // Same pattern as surgical/labs, subject: 'fundamental'
});
```

### Backend — professor.js

Add 3 endpoints (pattern matches existing SUR/MED/OB blocks starting at lines 516, 596, 678):

1. `router.get('/fundamental/labs', professorAuth, ...)` — get labs stats for all students (subject: `'fundamental'`)
2. `router.get('/student/:userId/fundamental/labs', professorAuth, ...)` — get a specific student's labs
3. `router.get('/student/:userId/lab/fundamental/:labNumber', professorAuth, ...)` — get lab details

Also update `download-scores` (~lines 221-342):
```js
// In the universityCode prefix checks (~line 233):
if (upperUniversityCode.startsWith("FUN")) {
  subjectFilter = { subject: "fundamental" };
}
```

### Backend — LabInfo seeding

The `LabInfo` collection in MongoDB needs seed documents for `subject: 'fundamental'`, labNumbers 1-3. This is typically done via a migration script or admin dashboard. Document as a post-deployment step.

---

## Implementation Order

1. **Backend first**: `vnl-2025-lab-backend.js` (routes + processing functions) → `student.js` → `professor.js`
2. **Frontend components**: `FundamentalRecordingComponent.jsx` → `fundamental-1.jsx` through `fundamental-3en.jsx`
3. **Frontend pages**: `FundamentalStudentDashboard.jsx` → `FundamentalLabHistory.jsx` → remaining 3 professor pages
4. **Frontend wiring**: `App.jsx` (imports + routes) → `Signin.jsx` → `Signup.jsx`
5. **Route bug fix**: Fix the 3 duplicate `/:subject/:labNumber/history` routes
6. **Seed data**: Insert LabInfo documents for `subject: 'fundamental'`, labNumbers 1, 2, 3
7. **Verify**: Create a FUN register code via admin dashboard, sign up as student, verify dashboard loads, verify lab opens, verify professor dashboard works

---

## Files Not Modified

- `backend/routes/index.js` — the vnl2025 router already catches `/api/v1/vnl2025/fundamental/{labNumber}`
- `backend/db.js` — no schema changes needed
- `backend/middleware.js` — no changes needed
- `frontend/src/api/axios.js` — no changes needed
- `frontend/src/context/AuthContext.jsx` — no changes needed
- Any SUR/MED/OB existing component files — no changes except the route fix

---

## Validation

After implementation:
1. Student with `FUN` register code: signs up → redirected to `/fundamental/dashboard`
2. Student dashboard displays 3 labs in a grid, progress bar
3. Clicking Lab 1 → `/student/fundamental/1` → shows TH content, video, recording UI
4. Language dropdown switches to EN → `/student/fundamental/1en` → shows EN content
5. Recording + submission returns score/pros/recommendations
6. Professor with `FUN` code: signs in → redirected to `/professor/fundamental/dashboard`
7. Professor dashboard shows student list, scores, downloadable CSV
8. Clicking a student → `/professor/fundamental/view-labs/:userId` → lab status grid
9. Clicking a lab → `/professor/fundamental/view-lab/:userId/:labNumber` → attempt details with media
10. Student history: `/fundamental/1/history` shows past attempts
