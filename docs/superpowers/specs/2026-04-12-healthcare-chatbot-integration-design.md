# Healthcare Chatbot & Synthetic Generation Integration Design

**Date**: 2026-04-12
**Status**: Draft
**Topic**: Porting Python-based healthcare assistant logic and synthetic dataset generation to Next.js.

## 1. Overview
The goal is to integrate the features from `tmp/simple-healthcare-chatbot` (Python/Streamlit) into the main Next.js project. This includes a multi-session chat assistant (OpenAI Assistants), PDF-based knowledge management, and a graph-based synthetic dataset generation pipeline.

## 2. Architecture

### 2.1 Chat Assistant Logic
The current Next.js project has a `(chat)` route but it is largely empty. We will implement:
- **Server-Side**: A route handler using the `openai` SDK to interact with the Assistants API.
- **Client-Side**: A chat interface that supports streaming responses and citation rendering.
- **Session Management**: Mapping local `Chat` IDs to OpenAI `Thread` IDs.

### 2.2 Document Management
- **Vector Store**: The Assistant uses a Vector Store for `file_search`.
- **API**: Endpoints to upload PDFs to OpenAI and attach them to the Vector Store.
- **DB Integration**: Track document metadata in the local `Document` table to sync with OpenAI's file system.

### 2.3 Synthetic Generation Workflow
- **LangGraph (TS)**: Port the LangGraph logic from Python to TypeScript using `@langchain/langgraph`.
- **Nodes**:
  - `planner`: Selects context chunks and difficulty.
  - `persona`: Generates a caregiver persona.
  - `synthesizer`: Generates a (prompt, response) pair.
  - `critic`: Validates quality and tone.
- **Execution**: A background API route `/api/generate/synthetic` to trigger runs.

## 3. Implementation Details

### 3.1 Schema Updates
We need to track OpenAI-specific IDs in our database.
- **Chat Table**: Add `threadId` (string) and `assistantId` (string).
- **Document Table**: Add `externalId` (the OpenAI File ID).

### 3.2 APIs
- `GET/POST /api/chat`: Handle assistant interactions.
- `POST /api/docs/upload`: Handle PDF uploads and indexing.
- `POST /api/generate/synthetic`: Trigger the LangGraph pipeline.

### 3.3 UI Components
- **Chat Interface**: Streamlit-style glassmorphism but unified with the existing design system.
- **Citation Tooltips**: Interactive elements that link to the source document segments.
- **Knowledge Dashboard**: A simple list to view and delete indexed documents.

## 4. Success Criteria
- [ ] Next.js Chat interface can talk to an OpenAI Assistant.
- [ ] Chat responses include clickable citations from uploaded PDFs.
- [ ] Users can upload PDFs which are immediately searchable by the AI.
- [ ] Synthetic generation API produces a valid JSON dataset based on the uploaded PDFs.
