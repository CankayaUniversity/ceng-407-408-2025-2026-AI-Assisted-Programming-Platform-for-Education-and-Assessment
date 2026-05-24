# Testing and Validation Report

## 1. Document Control

| Field | Value |
|---|---|
| Project Name | AI-Assisted Programming Platform for Education and Assessment |
| Report Type | Testing and Validation Report |
| Version | 1.6 |
| Date | 21.05.2026 |
| System Under Test | Backend services, deployed web application, and CI/CD workflow |
| Repository Scope | Backend, frontend, infrastructure configuration, and deployed platform |

## 2. Purpose

This report documents the testing and validation activities performed for the AI-Assisted Programming Platform for Education and Assessment. The goal is to verify the current functional state of the project through backend checks, deployed system checks, CI/CD review, bug tracking observations, and coverage-status review.

The report focuses on observable and reproducible validation evidence. It records both successful behavior and known quality gaps, including build failure, missing automated unit tests, and unavailable formal coverage metrics.

## 3. Scope

### 3.1 In Scope

- Backend health endpoint validation
- Student authentication validation
- Problem retrieval validation
- Student history validation
- AI hint endpoint validation
- Database migration validation
- Database seed validation
- Deployed student and teacher UI workflow validation
- CI/CD workflow review
- Bug tracking observations
- Coverage report availability check

### 3.2 Out of Scope

- Performance and load testing
- Penetration/security testing
- Cross-browser compatibility testing
- Accessibility certification
- Complete judged-output validation for all code execution cases
- Formal numeric coverage certification

## 4. Test Environment

| Item | Configuration |
|---|---|
| Deployed Platform | https://aiassistedprogramming.com.tr/ |
| Local Backend URL | http://127.0.0.1:5000 |
| Operating System | Windows |
| Runtime | Node.js v24.14.1 |
| Database | PostgreSQL 16 |
| Container Runtime | Docker Desktop |
| Backend Port | 5000 |
| Judge0 Port | 2358 |
| AI Runtime Port | 11434 |
| Test Tools | PowerShell, Prisma CLI, Docker, deployed web UI, GitHub Actions workflow review |

## 5. Test Design Specifications

Backend validation was performed by sending HTTP requests to local API endpoints and by running Prisma migration, seed, build, and test commands. System validation was performed on the deployed platform by checking student and teacher workflows. CI/CD validation was performed by reviewing the GitHub Actions workflow configuration. Bug tracking and coverage validation were handled by documenting observed failures and verifying whether automated test and coverage tooling existed.

The following test result statuses are used:

- Pass: The observed result matched the expected result.
- Fail: The observed result did not match the expected result.
- Partial Pass: The scenario was partially validated, but the collected evidence was not sufficient to confirm the full expected behavior.

### 5.1 Graphical User Interface (GUI)

#### 5.1.1 Subfeatures to be tested

- Portal selection screen
- Student sign-in screen
- Teacher sign-in screen
- Student problem-solving screen
- Code run output panel
- AI Mentor chat panel
- Teacher dashboard
- Exam mode control panel

#### 5.1.2 Test cases

| ID | Requirement | Priority | Scenario Description | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| GUI-01 | Portal Selection | High | Open the deployed application landing page and verify portal selection options. | Student and Teacher portal entry points should be visible and accessible. | Both Student and Teacher portal options were displayed correctly. | Pass |
| GUI-02 | Student Login Screen | High | Open the Student portal login page. | Student sign-in form should load correctly. | Student sign-in form loaded successfully. | Pass |
| GUI-03 | Teacher Login Screen | High | Open the Teacher portal login page. | Teacher sign-in form should load correctly. | Teacher sign-in form loaded successfully. | Pass |
| GUI-04 | Student Problem Solving Screen | High | Access a student problem page containing the editor and problem description. | Problem description, language selector, and code editor should be visible. | The student problem-solving screen displayed all expected components. | Pass |
| GUI-05 | Code Run Flow | High | Trigger code execution from the student editor screen. | The output panel should update after the run action. | The output panel showed Compiling... and Compiled OK; final judged status was not confirmed from the collected evidence. | Partial Pass |
| GUI-06 | AI Mentor Interaction | Medium | Send a hint request through the deployed AI Mentor chat interface. | The system should return a mentor response to the student. | The chat interface returned an AI Mentor response successfully. | Pass |
| GUI-07 | Teacher Dashboard | Medium | Open the teacher dashboard after sign-in. | Teacher metrics and management widgets should be visible. | Dashboard metrics, assignments section, and controls were displayed. | Pass |
| GUI-08 | Exam Mode Control | Medium | Access the teacher exam mode section. | Teacher should be able to view exam mode controls. | Exam mode toggle and student/group scope controls were visible. | Pass |

### 5.2 Backend and API

#### 5.2.1 Subfeatures to be tested

- Backend health endpoint
- Student authentication endpoint
- Problem retrieval endpoint
- Student history endpoint
- AI hint endpoint

#### 5.2.2 Test cases

| ID | Requirement | Priority | Scenario Description | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| API-01 | Backend Availability | High | Send a request to the /health endpoint. | The API should respond successfully and indicate healthy service status. | The API returned status=ok and service=api. | Pass |
| API-02 | Student Authentication | High | Submit valid student credentials to /api/auth/login. | The system should authenticate the student and return an access token. | Login succeeded and an accessToken was returned. | Pass |
| API-03 | Problem Retrieval | High | Request /api/problems using a valid bearer token. | The system should return the available programming problems. | The endpoint returned the seeded problem list successfully. | Pass |
| API-04 | Submission History | Medium | Request /api/student/history using a valid bearer token. | The system should return stored student submission records. | The endpoint returned submission history records successfully. | Pass |
| API-05 | AI Hint Response | Medium | Submit a request to /api/ai/hint with problem ID, language, and source code. | The system should return AI mentor guidance. | The endpoint returned success=true; fallback response was used because mentor service was unavailable. | Pass |

### 5.3 Database Integration

#### 5.3.1 Subfeatures to be tested

- Prisma migration execution
- Seed data initialization
- PostgreSQL connectivity through Prisma

#### 5.3.2 Test cases

| ID | Requirement | Priority | Scenario Description | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| DB-01 | Database Migration | High | Run npx prisma migrate dev in the backend environment. | The database schema should be applied successfully. | Prisma reported that the schema was already in sync and no pending migration remained. | Pass |
| DB-02 | Database Seed | High | Run npm run prisma:seed in the backend environment. | Demo data should be inserted successfully. | Seed process completed successfully. | Pass |

### 5.4 Build, Unit Testing, and CI/CD

#### 5.4.1 Subfeatures to be tested

- Backend TypeScript build
- Backend unit test command
- GitHub Actions workflow configuration

#### 5.4.2 Test cases

| ID | Requirement | Priority | Scenario Description | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| BUILD-01 | Backend Build Validation | High | Run npm run build in the backend environment. | Backend TypeScript source should compile without errors. | Build failed due to TypeScript type mismatches in AI logging and audit-related files. | Fail |
| UNIT-01 | Unit Test Execution | Medium | Run npm test in the backend environment. | Automated unit tests should execute successfully. | No real unit test suite exists; placeholder script returned Error: no test specified. | Fail |
| CICD-01 | CI/CD Workflow Review | Medium | Review .github/workflows/ci.yml. | CI should include dependency installation and build validation steps. | GitHub Actions workflow includes backend install, Prisma generate, backend build, frontend install, and frontend build steps. Automated test and coverage steps are not configured. | Partial Pass |

### 5.5 Bug Tracking and Coverage

#### 5.5.1 Subfeatures to be tested

- Known issue documentation
- Coverage report availability
- Validation gaps related to automated testing

#### 5.5.2 Test cases

| ID | Requirement | Priority | Scenario Description | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|---|
| BUG-01 | Bug Tracking | Medium | Review observed defects during validation. | Known failures should be documented with severity and current status. | Judge0 runtime issue, AI fallback dependency issue, backend build failure, missing unit tests, and coverage absence were documented as tracked quality issues. | Pass |
| COV-01 | Coverage Report | Medium | Check whether formal coverage reporting is available. | The project should provide automated coverage output if coverage is required. | No coverage script or coverage publication step is currently configured. Formal numeric coverage is not available. | Fail |

## 6. Detailed Test Case Specifications

Section 5 lists the test cases at summary level. Its purpose is to show which requirement is tested, why it matters, and whether the result passed. This section expands the same validation scope into execution-ready detailed test cases. In other words, Section 5 answers "what is tested?", while Section 6 answers "how is the test executed and what evidence was observed?".

### 6.1 Summary Test Cases vs Detailed Test Cases

| Comparison Area | Summary Test Cases in Section 5 | Detailed Test Cases in Section 6 |
|---|---|---|
| Main purpose | Requirement coverage and high-level result tracking | Repeatable execution procedure and evidence recording |
| Typical reader | Reviewer, instructor, project manager | Tester, developer, maintainer |
| Level of detail | Short scenario description with expected and actual result | Purpose, setup, test data, procedure, verification, cleanup, observed result, and status |
| Use in report | Shows the test matrix | Shows how each important test can be reproduced |
| Example field | Scenario Description | Procedure [A01] and Verification [V01] |

### 6.2 Detailed Test Case Template

Each detailed test case follows the template below. TC means Test Case.

| Field | Description |
|---|---|
| TC_ID | Unique identifier of the detailed test case |
| Related Summary ID | Matching test case ID from Section 5 |
| Requirements | Functional or quality area being validated |
| Priority | Relative importance of the test case |
| Estimated Time Needed | Approximate time required to execute the test |
| Dependency | Required external state, service, account, or configuration |
| Purpose | What the test intends to prove |
| Setup | Required system state before execution |
| Test Data | Input values, credentials, commands, endpoint paths, or files used during the test |
| Procedure | [A01] Ordered actions performed by the tester |
| Verification | [V01] Result that should occur if the system behaves correctly |
| Observed Result | Result observed during validation |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass, Fail, or Partial Pass |

### 6.3 Detailed Test Cases

#### GUI.PORTAL.01 Portal Selection

| Field | Value |
|---|---|
| TC_ID | GUI.PORTAL.01 |
| Related Summary ID | GUI-01 |
| Requirements | Portal Selection |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that users can choose between Student and Teacher portals from the deployed landing page. |
| Setup | The deployed platform must be reachable from a browser. |
| Test Data | URL: https://aiassistedprogramming.com.tr/ |
| Procedure | [A01] Open the deployed URL. Inspect the landing page. Confirm that Student Portal and Teacher Portal options are visible. |
| Verification | [V01] Both portal entry points should be displayed and selectable. |
| Observed Result | Student and Teacher portal options were displayed correctly. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### GUI.SLOGIN.01 Student Login Screen

| Field | Value |
|---|---|
| TC_ID | GUI.SLOGIN.01 |
| Related Summary ID | GUI-02 |
| Requirements | Student Login Screen |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the student sign-in screen loads correctly. |
| Setup | The deployed platform must be reachable and the Student portal must be selectable. |
| Test Data | Demo student account shown on the UI: student1@demo.com |
| Procedure | [A01] Open the landing page. Select Student Portal. Inspect the login form fields and sign-in action. |
| Verification | [V01] Student email field, password field, and sign-in button should be visible. |
| Observed Result | Student sign-in form loaded successfully. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### GUI.TLOGIN.01 Teacher Login Screen

| Field | Value |
|---|---|
| TC_ID | GUI.TLOGIN.01 |
| Related Summary ID | GUI-03 |
| Requirements | Teacher Login Screen |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the teacher sign-in screen loads correctly. |
| Setup | The deployed platform must be reachable and the Teacher portal must be selectable. |
| Test Data | Demo teacher account shown on the UI: teacher1@demo.com |
| Procedure | [A01] Open the landing page. Select Teacher Portal. Inspect the login form fields and sign-in action. |
| Verification | [V01] Teacher email field, password field, and sign-in button should be visible. |
| Observed Result | Teacher sign-in form loaded successfully. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### GUI.PROBLEM.01 Student Problem Solving Screen

| Field | Value |
|---|---|
| TC_ID | GUI.PROBLEM.01 |
| Related Summary ID | GUI-04 |
| Requirements | Student Problem Solving Screen |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the student can access the assignment workspace and see the required problem-solving components. |
| Setup | Student portal must be accessible and at least one assignment must exist. |
| Test Data | Problem example: Check Prime Number |
| Procedure | [A01] Sign in as student. Open an assignment. Inspect the problem statement, language selector, code editor, Run button, Submit button, and AI Mentor panel. |
| Verification | [V01] Problem description, editor, language selector, run controls, and mentor panel should be visible. |
| Observed Result | Problem description, language selector, editor, and mentor panel were visible. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### GUI.RUN.01 Code Run Flow

| Field | Value |
|---|---|
| TC_ID | GUI.RUN.01 |
| Related Summary ID | GUI-05 |
| Requirements | Code Run Flow |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the student code editor can start a code execution attempt and update the output panel. |
| Setup | Student problem-solving page must be open and a language must be selected. |
| Test Data | Language: C. Starter code from the Check Prime Number problem. |
| Procedure | [A01] Select the language. Keep or edit the starter code. Click Run. Observe the output panel. |
| Verification | [V01] Output panel should display compilation or execution feedback after the Run action. |
| Observed Result | Output panel showed Compiling... and Compiled OK. Final judged result was not captured in the collected evidence. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Partial Pass |

#### GUI.MENTOR.01 AI Mentor Interaction

| Field | Value |
|---|---|
| TC_ID | GUI.MENTOR.01 |
| Related Summary ID | GUI-06 |
| Requirements | AI Mentor Interaction |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the AI Mentor chat panel can return a response to a student hint request. |
| Setup | Student problem page and AI Mentor panel must be visible. |
| Test Data | Prompt example: Give me a hint |
| Procedure | [A01] Open the AI Mentor chat panel. Submit a hint request. Observe whether a mentor reply is displayed. |
| Verification | [V01] AI Mentor should return a contextual response. |
| Observed Result | AI Mentor returned a visible response in the chat panel. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### GUI.TDASH.01 Teacher Dashboard

| Field | Value |
|---|---|
| TC_ID | GUI.TDASH.01 |
| Related Summary ID | GUI-07 |
| Requirements | Teacher Dashboard |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the teacher dashboard displays class-level metrics and management sections. |
| Setup | Teacher portal must be accessible and teacher credentials must be valid. |
| Test Data | Demo teacher account: teacher1@demo.com |
| Procedure | [A01] Sign in as teacher. Open the dashboard page. Inspect class overview, assignments, and dashboard controls. |
| Verification | [V01] Teacher metrics and management widgets should be visible. |
| Observed Result | Dashboard metrics, assignments section, and controls were displayed. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### GUI.EXAM.01 Exam Mode Control

| Field | Value |
|---|---|
| TC_ID | GUI.EXAM.01 |
| Related Summary ID | GUI-08 |
| Requirements | Exam Mode Control |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that teacher exam mode controls are visible. |
| Setup | Teacher dashboard must be open. |
| Test Data | Scope options: all students and visible student groups |
| Procedure | [A01] Open the teacher dashboard. Inspect the Exam Mode section. Check whether toggle and scope controls are visible. |
| Verification | [V01] Exam mode toggle and student or group targeting controls should be visible. |
| Observed Result | Exam mode toggle and group selection controls were visible. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### API.HEALTH.01 Backend Availability

| Field | Value |
|---|---|
| TC_ID | API.HEALTH.01 |
| Related Summary ID | API-01 |
| Requirements | Backend Availability |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the backend service is reachable. |
| Setup | Backend must be running locally on port 5000. |
| Test Data | GET http://127.0.0.1:5000/health |
| Procedure | [A01] Start the backend service. Send a GET request to the health endpoint using PowerShell. Record the response. |
| Verification | [V01] API should return a healthy status response. |
| Observed Result | API returned status=ok and service=api. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### API.AUTH.01 Student Authentication

| Field | Value |
|---|---|
| TC_ID | API.AUTH.01 |
| Related Summary ID | API-02 |
| Requirements | Student Authentication |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that valid student credentials produce an authentication token. |
| Setup | Backend and database must be running. Seed data must exist. |
| Test Data | Email: student1@demo.com. Password: 123456. Endpoint: POST /api/auth/login |
| Procedure | [A01] Create a JSON request body with valid credentials. Send POST request to /api/auth/login. Inspect response body. |
| Verification | [V01] API should return an access token. |
| Observed Result | Login succeeded and accessToken was returned. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### API.PROBLEM.01 Problem Retrieval

| Field | Value |
|---|---|
| TC_ID | API.PROBLEM.01 |
| Related Summary ID | API-03 |
| Requirements | Problem Retrieval |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that authenticated students can retrieve programming problems. |
| Setup | Backend must be running and a valid bearer token must be available. |
| Test Data | GET /api/problems with Authorization header |
| Procedure | [A01] Authenticate as student. Store the returned token. Send GET request to /api/problems using the bearer token. |
| Verification | [V01] API should return seeded problem records. |
| Observed Result | Endpoint returned seeded problem list successfully. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### API.HISTORY.01 Submission History

| Field | Value |
|---|---|
| TC_ID | API.HISTORY.01 |
| Related Summary ID | API-04 |
| Requirements | Submission History |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that authenticated students can retrieve previous submission records. |
| Setup | Backend must be running, a valid bearer token must exist, and submission history must be present. |
| Test Data | GET /api/student/history with Authorization header |
| Procedure | [A01] Authenticate as student. Send GET request to /api/student/history. Inspect returned data collection. |
| Verification | [V01] API should return stored student submission history records. |
| Observed Result | Endpoint returned student submission history records successfully. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### API.HINT.01 AI Hint Response

| Field | Value |
|---|---|
| TC_ID | API.HINT.01 |
| Related Summary ID | API-05 |
| Requirements | AI Hint Response |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the backend AI hint endpoint returns guidance for a valid request. |
| Setup | Backend must be running and a valid bearer token must be available. |
| Test Data | problemId: 1. mode: hint. language: python. question: Bu cozum dogru mu? |
| Procedure | [A01] Authenticate as student. Build the JSON request body. Send POST request to /api/ai/hint. Record success, mentorReply, fallbackUsed, validator, and policyAction fields. |
| Verification | [V01] API should return mentor guidance and policy validation result. |
| Observed Result | Endpoint returned success=true. Fallback response was used because mentor service was unavailable. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### DB.MIGRATE.01 Database Migration

| Field | Value |
|---|---|
| TC_ID | DB.MIGRATE.01 |
| Related Summary ID | DB-01 |
| Requirements | Database Migration |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the Prisma database schema can be applied successfully. |
| Setup | PostgreSQL container must be running and DATABASE_URL must be configured. |
| Test Data | Command: npx prisma migrate dev |
| Procedure | [A01] Open terminal in backend directory. Run the Prisma migration command. Observe migration result. |
| Verification | [V01] Database schema should be applied or reported as already synchronized. |
| Observed Result | Prisma reported that the schema was already in sync and no pending migration remained. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### DB.SEED.01 Database Seed

| Field | Value |
|---|---|
| TC_ID | DB.SEED.01 |
| Related Summary ID | DB-02 |
| Requirements | Database Seed |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that demo data can be inserted into the database. |
| Setup | PostgreSQL container must be running and Prisma client must be generated. |
| Test Data | Command: npm run prisma:seed |
| Procedure | [A01] Open terminal in backend directory. Run the seed command. Observe terminal output. |
| Verification | [V01] Seed data should be inserted successfully. |
| Observed Result | Seed process completed successfully. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### BUILD.TSC.01 Backend Build Validation

| Field | Value |
|---|---|
| TC_ID | BUILD.TSC.01 |
| Related Summary ID | BUILD-01 |
| Requirements | Backend Build Validation |
| Priority | High |
| Estimated Time Needed | 3 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify whether the backend TypeScript project compiles successfully. |
| Setup | Backend dependencies must be installed. |
| Test Data | Command: npm run build |
| Procedure | [A01] Open terminal in backend directory. Run npm run build. Record compiler output. |
| Verification | [V01] TypeScript compilation should finish without errors. |
| Observed Result | Build failed due to TypeScript type mismatches in AI logging and audit-related files. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Fail |

#### UNIT.NPM.01 Unit Test Execution

| Field | Value |
|---|---|
| TC_ID | UNIT.NPM.01 |
| Related Summary ID | UNIT-01 |
| Requirements | Unit Test Execution |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify whether an automated backend unit test suite exists and can be executed. |
| Setup | Backend dependencies must be installed. |
| Test Data | Command: npm test |
| Procedure | [A01] Open terminal in backend directory. Run npm test. Record the returned output and exit status. |
| Verification | [V01] Automated unit tests should execute successfully. |
| Observed Result | Placeholder script returned Error: no test specified. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Fail |

#### CICD.WORKFLOW.01 CI/CD Workflow Review

| Field | Value |
|---|---|
| TC_ID | CICD.WORKFLOW.01 |
| Related Summary ID | CICD-01 |
| Requirements | CI/CD Workflow Review |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that the repository contains automated build validation workflow steps. |
| Setup | Repository workflow configuration must be available. |
| Test Data | File: .github/workflows/ci.yml |
| Procedure | [A01] Open the CI workflow file. Review backend install, Prisma generate, backend build, frontend install, frontend build, test, and coverage steps. |
| Verification | [V01] Workflow should include dependency installation, build validation, test execution, and coverage reporting if required. |
| Observed Result | Workflow includes install, Prisma generate, backend build, frontend install, and frontend build. Automated test and coverage steps are not configured. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Partial Pass |

#### BUG.TRACK.01 Bug Tracking

| Field | Value |
|---|---|
| TC_ID | BUG.TRACK.01 |
| Related Summary ID | BUG-01 |
| Requirements | Bug Tracking |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify that known defects discovered during validation are recorded in the report. |
| Setup | Validation output and observed failures must be available. |
| Test Data | Judge0 runtime issue, AI fallback dependency issue, backend build failure, missing unit tests, missing coverage report |
| Procedure | [A01] Review validation results. List observed issues. Assign each issue a current status in the report. |
| Verification | [V01] Known issues should be documented clearly with current validation impact. |
| Observed Result | Known issues were documented as tracked quality issues. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Pass |

#### COV.REPORT.01 Coverage Report

| Field | Value |
|---|---|
| TC_ID | COV.REPORT.01 |
| Related Summary ID | COV-01 |
| Requirements | Coverage Report |
| Priority | Medium |
| Estimated Time Needed | 2 Minutes |
| Dependency | Required service, page, credentials, or configuration must be available before execution. |
| Purpose | Verify whether formal automated code coverage output is available. |
| Setup | Repository package scripts and CI workflow must be available. |
| Test Data | Backend package scripts and CI workflow configuration |
| Procedure | [A01] Inspect backend test scripts. Inspect CI workflow for coverage generation or publication steps. |
| Verification | [V01] Coverage report should be available if coverage reporting is configured. |
| Observed Result | No coverage script or coverage publication step was found. Formal numeric coverage is not available. |
| Cleanup | Close the related page, clear temporary request variables if needed, and return the terminal or browser to idle state. |
| Status | Fail |
