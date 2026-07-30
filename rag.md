Scraper Architecture & RAG Pipeline Specifications1. Scraper Evaluation: Is Scrapy Better?Yes, Scrapy is significantly better for bulk document crawling, but with a hybrid caveat depending on the target site structure.Scrapy vs. Playwright ComparisonCriteriaScrapyPlaywright / PuppeteerArchitectureAsynchronous network engine (Twisted)Headless browser execution (Chromium Engine)Speed & Resource Usage⚡ Extremely Fast (~1,000 requests/min, low RAM)🐢 Resource Heavy (High CPU/RAM per instance)Best Used ForStatic HTML pages, direct PDF downloads, API endpoints, sitemaps.Dynamic JS rendering, ASP.NET postbacks, CAPTCHA forms.Bangladesh TargetsBG Press, Ministry Websites, Planning Commission archives.e-GP Portal (due to ASP.NET \_\_VIEWSTATE & session cookies).Recommended Hybrid Strategy: scrapy-playwrightInstead of choosing one, use Scrapy as the core crawling framework with the scrapy-playwright middleware integration:BG Press & Ministry Crawlers (Pure Scrapy): Downloads 100,000+ gazette PDFs and HTML links asynchronously using minimal CPU resources.e-GP Tender Crawler (Scrapy + Playwright Integration): When Scrapy encounters ASP.NET dynamic pagination on eprocure.gov.bd, it delegates only that specific page request to a headless Playwright context to handle postbacks and session state, then hands the rendered HTML back to Scrapy for fast parsing.2. RAG Pipeline Step-by-Step SpecificationThe retrieval-augmented generation (RAG) pipeline is designed specifically to handle dense Bangla legal text, mixed Banglish/English terms, and multi-row tender tables. [ Raw Gazette PDF / Tender ]
│
▼
Step 1: OCR & Preprocessing ──► Clean Markdown & Table Preservation
│
▼
Step 2: Semantic Chunking ──► Clause-Aware & Header-Based Splitting
│
▼
Step 3: Vector Embedding ──► Multi-lingual Model (BAAI/bge-m3)
│
▼
Step 4: Vector & Metadata ──► Vectorize / Qdrant + Metadata Payloads
│
▼
Step 5: Hybrid Retrieval ──► Sparse (BM25 SQL) + Dense (Vector) -> RRF
│
▼
Step 6: Cross-Encoder Rerank──► BAAI/bge-reranker-v2-m3
│
▼
Step 7: Citation Generation ──► Grounded LLM Prompting with PDF Page Anchors

Step 1: Document Parsing & PreprocessingPDF Extraction:Text-based PDFs: Parsed using PyMuPDF / pdfplumber.Scanned Physical PDFs: Processed via Python PaddleOCR microservice.Table Preservation:Tables in tenders must never be flattened into unstructured text. They are extracted and converted into formatted Markdown Tables or JSON strings to preserve column-row relationships.Metadata Association: Every document retains immutable metadata attributes:{
"document_id": "bgpress_2024_08_12_001",
"source_url": "https://dpp.gov.bd/.../gazette_1234.pdf",
"r2_storage_key": "raw/2024/08/gazette_1234.pdf",
"ministry": "Ministry of Public Works",
"publishing_date": "2024-08-12",
"document_type": "Gazette"
}

Step 2: Semantic Chunking StrategyStandard fixed-length character chunking breaks legal clauses and splits pricing tables mid-sentence. We implement a Two-Tier Chunking Model:A. Clause-Aware Structural Chunking (For Gazettes & Laws)Strategy: Splitting occurs primarily at natural document boundaries (Markdown headers #, ##, ###, section numbers, or Bengali clause markers like ১., ক)).Target Size: $500 - 800$ tokens (~1,500 - 2,400 characters).Overlap: 100-token sliding window overlap between contiguous clauses to maintain contextual flow across boundaries.B. Table & Line-Item Unit Chunking (For e-GP Tenders)Strategy: Each tender item row (or group of 5 related item rows) is kept as a self-contained, indivisible chunk along with the Tender ID and Procuring Entity metadata header.Step 3: Embeddings GenerationModel: BAAI/bge-m3 (Multi-Lingual, Multi-Granularity, Multi-Functionality).Why bge-m3? It natively supports cross-lingual retrieval (queries in English match Bangla documents and vice versa) and outputs 1024-dimensional dense vectors while natively supporting Bengali vocabulary.Vector Normalization: All vector outputs are $L_2$-normalized prior to insertion.Step 4: Hybrid Indexing & Metadata StorageTo combine fast exact lookups (Tender ID, NID, Vendor Name) with semantic concept matching:Dense Vector Store (Cloudflare Vectorize / Qdrant): Stores the embedding vector along with chunk*id, document_id, and page_number.Sparse / Full-Text Index (SQLite D1 FTS5): Indexes raw text, Tender IDs, and vendor registration numbers for exact keyword matching (BM25).Step 5: Hybrid Retrieval & Reciprocal Rank Fusion (RRF)When a user submits a query:Parallel Query Execution:Query is converted to vector $V_q$ and retrieves Top 30 dense candidates from Vectorize.Query keywords are run through SQLite FTS5 retrieving Top 30 sparse candidates.Reciprocal Rank Fusion (RRF):Combines candidate lists into a unified ranking using the RRF formula:$$RRF_Score(d) = \sum*{m \in M} \frac{1}{k + r_m(d)}$$(Where $k = 60$, $M$ represents the retrieval methods, and $r_m(d)$ is the rank of document $d$ in method $m$.)Step 6: Context RerankingThe top 30 candidates from RRF are passed through a lightweight Cross-Encoder model to trim noise and re-order by strict relevance:Reranker Model: BAAI/bge-reranker-v2-m3Process: Compares the raw query directly against each document chunk text pair $(Q, D_i)$ and assigns a relevance score between $0.0$ and $1.0$.Output: Selects the top $5 - 7$ highest-scoring chunks to feed into the final LLM prompt context window.Step 7: Citation-Enforced LLM Prompt EngineeringThe reranked context chunks are injected into the final generator model (Llama 3.1 70B or Gemini) with explicit guardrails:SYSTEM PROMPT:
You are ShottoPrakash AI, an investigative civic intelligence engine for Bangladesh.
Answer the user's question accurately using ONLY the provided contexts below.

RULES:

1. Every claim, figure, date, or name MUST end with an inline source citation tag matching [Doc X, Page Y].
2. If the contexts do not contain enough information to answer fully, state in plain Bangla:
   "প্রদত্ত সরকারি গেজেট বা টেন্ডার রেকর্ডে এ বিষয়ে পর্যাপ্ত তথ্য পাওয়া যায়নি।"
3. Do not extrapolate, infer unstated political motives, or hallucinate facts.

CONTEXT DOCUMENTS:
[Doc 1 | ID: bgpress_8941 | Page 3]: ...পল্লী উন্নয়ন ও সমবায় বিভাগ কর্তৃক নলকূপ ক্রয়ের জন্য বরাদ্দ ৪,৫০,০০,০০০ টাকা...
[Doc 2 | ID: egp_tender_231 | Page 1]: ...M/S Rahman Enterprise was selected as the lowest responsive bidder...

USER QUERY:
জনস্বাস্থ্য প্রকৌশল অধিদপ্তরের নলকূপ প্রকল্পের বরাদ্দ ও ঠিকাদার কে?
