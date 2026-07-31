ShottoPrakash (সত্যপ্রকাশ) — Technical Specification DocumentPlatform Architecture, Scraping Specifications, AI Engine, and Data Flow1. System Architecture OverviewShottoPrakash is built natively on the Cloudflare Serverless Ecosystem for edge performance, low latency across Bangladesh, ultra-low hosting costs, and high scalability. Heavy compute workloads (such as Bangla OCR and complex graph algorithms) are decoupled into specialized background worker microservices.┌──────────────────────────────────────────────────────────────────────────────────┐
│ CLOUDFLARE EDGE │
│ │
│ ┌────────────────┐ ┌───────────────────┐ ┌────────────────────┐ │
│ │ Next.js UI │ ◄───► │ Cloudflare │ ◄───► │ Cloudflare Workers │ │
│ │ (Pages/Worker) │ │ Workers API Gateway│ │ AI / Hyperdrive │ │
│ └────────────────┘ └─────────┬─────────┘ └──────────┬─────────┘ │
│ │ │ │
│ ┌─────────────────────────┼────────────────────────────┘ │
│ ▼ ▼ │
│ ┌─────────────────┐ ┌──────────────────┐ ┌────────────────────┐ │
│ │ Cloudflare D1 │ │ Cloudflare R2 │ │ Cloudflare │ │
│ │ (Metadata DB) │ │ (PDF & Raw Store)│ │ Vectorize (RAG) │ │
│ └─────────────────┘ └──────────────────┘ └────────────────────┘ │
│ ▲ ▲ │
│ │ ┌──────────────────┐ │ │
│ └─────────────────┤ Cloudflare Queues├─────────────────┘ │
│ └─────────▲────────┘ │
└────────────────────────────────────────┼────────────────────────────────────────┘
│
┌────────────────────────────────────────┴────────────────────────────────────────┐
│ GPU & HEAVY COMPUTE EXTENSIONS │
│ │
│ ┌───────────────────────────┐ ┌────────────────────────────┐ │
│ │ Python Ingestion Workers │ │ Neo4j AuraDB │ │
│ │ (PaddleOCR / Playwright) │ │ (Supplier Graph Database) │ │
│ └───────────────────────────┘ └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘

Infrastructure MappingCloudflare ComponentRole / PurposeCloudflare Pages / WorkersFrontend application hosting (Next.js SSR/ISR) and edge API route handling.Cloudflare D1SQLite at the edge for relational structured metadata (Tenders, Ministries, User sessions, Audit logs).Cloudflare VectorizeHigh-performance vector database for semantic search, RAG embeddings, and document lookup.Cloudflare R2Zero-egress S3-compatible object storage for scraped raw PDFs, extracted images, and markdown texts.Cloudflare QueuesAsynchronous task distribution for scraping scheduling, OCR jobs, and embedding pipelines.Cloudflare Workers AIRunning edge LLMs (Llama 3.1 8B/70B, DeepSeek R1 Distill) and text embeddings (bge-m3, bge-base-en).Cloudflare KV & HyperdriveCaching search results, rate-limiting, and managing low-latency connections to external databases.Neo4j AuraDB (External)Managed Graph Database for supplier network topology, collusion detection, and director cross-linking.GPU OCR Microservice (External)Lightweight Python node (Modal/RunPod/Hetzner) executing PaddleOCR for scanned Bangla PDF parsing.2. Data Flow Diagrams (DFD)Level 0 DFD (Context Diagram) ┌─────────────────────────┐
│ Government Web Portals │
│ (e-GP, BG Press, MoF) │
└────────────┬────────────┘
│ Raw HTML & Scanned PDFs
▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Investive │ Queries │ SHOTTOPRAKASH│ Alert Feeds │ Citizens & │
│ Journalists ├────────────►│ SYSTEM ├────────────►│ General │
│ & Oversight │ Insights & │ ENGINE │ Plain Bangla│ Public │
│ Entities │ Citations │ │ Summaries │ │
└──────────────┘ └──────────────┘ └──────────────┘

Level 1 DFD (Detailed Data Pipeline)[ Gov Websites ] ──► (1.0 Scraping Worker) ──► Write PDF/HTML ──► [ R2 Storage ]
│
Push Task Event
│
▼
(2.0 Queue System) ──► (3.0 OCR & Text Extraction)
│
Structured JSON & MD
│
┌────────────────────────────────┴────────────────┐
▼ ▼
(4.0 Structuring & Graphing) (5.0 Chunking & Embedding)
│ │
┌────────────┴────────────┐ ▼
▼ ▼ (Cloudflare Vectorize)
[ D1 Database ] [ Neo4j Graph ] │
│ │ │
└─────────────────────────┼────────────────────────────────────┘
│
▼
(6.0 AI & RAG Gateway)
│
▼
(7.0 Web UI / Next.js)

3. Target Websites & Detailed Scraping Specification1. e-GP Portal (National e-Procurement)Base URL: https://www.eprocure.gov.bdTarget Sub-paths:Tender Notices: /resources/common/TenderDetails.jsp?id={TENDER_ID}Awarded Contracts: /resources/common/ViewContractAward.jsp?id={CONTRACT_ID}Annual Procurement Plans (APP): /resources/common/APPView.jsp?id={APP_ID}Scraping Strategy:Session Management: Requires cookie persistence and ASP.NET view-state handling.Parsing: Playwright browser instances extract structural DOM tables (Procuring Entity Name, Estimated Cost, Winning Bidder, Tender Security Amount, Unit Rates).Frequency: Incremental cron jobs running every 6 hours via Cloudflare Workers Cron Triggers dispatching scrapers.2. BG Press (Extraordinary Gazettes)Base URL: http://www.dpp.gov.bd/bgpressTarget Sub-paths:Gazette Listing: /index.php/gazette/extra_ordinaryPDF Storage Path: /upload/gazette_extra/gazette_doc/{YEAR}/{MONTH}/{FILE_NAME}.pdfScraping Strategy:HTML listing parsed daily to discover new PDF URLs.Direct stream download into Cloudflare R2 under bucket key /bgpress/{year}/{month}/{filename}.pdf.3. Ministry of Finance & Planning CommissionBase URLs: https://mof.gov.bd, https://plancomm.gov.bdTarget Sub-paths:Annual Development Program (ADP): /site/page/{PAGE_ID}/ADP-AllocationsMinistry Budget Summaries: /site/view/budget_reports/Scraping Strategy:Scrapes published PDF links and Excel budget spreadsheets. Converts spreadsheets into structured JSON rows stored in Cloudflare D1.4. Entity-Relationship (ER) Diagram & Schema+-------------------+ +-----------------------+ +---------------------+
   | procuring_org | | tenders | | vendors |
   +-------------------+ +-----------------------+ +---------------------+
   | id (PK) |<----1-| id (PK) |-1---N>| id (PK) |
   | name_bangla | | tender_id_official | | company_name |
   | name_english | | procuring_org_id (FK) | | trade_license_no |
   | ministry | | title | | tin_number |
   | district | | estimated_budget | | address |
   +-------------------+ | awarded_amount | +----------┬----------+
   | winning_vendor_id(FK) | │
   | status | │
   | published_at | │
   +-----------┬-----------+ │
   │ │
   1 1
   │ │
   N N
   +-----------┴-----------+ +----------┴----------+
   | tender_items | | vendor_directors |
   +-----------------------+ +---------------------+
   | id (PK) | | id (PK) |
   | tender_id (FK) | | vendor_id (FK) |
   | item_description | | director_name |
   | quantity | | nid_number |
   | unit_price_estimated | | phone_number |
   | unit_price_awarded | +---------------------+
   +-----------------------+

D1 Relational SQL Schema-- Procuring Entities Table
CREATE TABLE procuring_orgs (
id TEXT PRIMARY KEY,
name_bangla TEXT NOT NULL,
name_english TEXT,
ministry TEXT NOT NULL,
district TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tenders Table
CREATE TABLE tenders (
id TEXT PRIMARY KEY, -- e-GP Tender ID
procuring_org_id TEXT REFERENCES procuring_orgs(id),
title TEXT NOT NULL,
category TEXT,
procurement_method TEXT, -- e.g., OTM, LTM, RFQ
estimated_budget REAL,
awarded_amount REAL,
winning_vendor_id TEXT REFERENCES vendors(id),
publishing_date DATETIME,
closing_date DATETIME,
r2_pdf_key TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Itemized Line Items (For Price Anomaly Detection)
CREATE TABLE tender_items (
id TEXT PRIMARY KEY,
tender_id TEXT REFERENCES tenders(id),
item_description TEXT NOT NULL,
quantity REAL NOT NULL,
unit_type TEXT,
unit_price_estimated REAL,
unit_price_awarded REAL,
is_anomaly BOOLEAN DEFAULT FALSE,
anomaly_score REAL DEFAULT 0.0
);

-- Vendors Table
CREATE TABLE vendors (
id TEXT PRIMARY KEY,
company_name TEXT NOT NULL,
trade_license_no TEXT UNIQUE,
tin_number TEXT UNIQUE,
address TEXT,
phone TEXT,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Vendor Directors (For Collusion Networks)
CREATE TABLE vendor_directors (
id TEXT PRIMARY KEY,
vendor_id TEXT REFERENCES vendors(id),
director_name TEXT NOT NULL,
nid_number TEXT,
phone_number TEXT
);

Neo4j Graph Model StructureNodes:(:Vendor {id, name, trade_license})(:Director {nid, name})(:ProcuringEntity {id, name, ministry})(:Tender {id, title, budget})Relationships:(:Director)-[:OWNS_OR_MANAGES]->(:Vendor)(:Vendor)-[:BID_ON {amount, status}]->(:Tender)(:Tender)-[:ISSUED_BY]->(:ProcuringEntity)(:Vendor)-[:SHARED_ADDRESS]->(:Vendor)5. Pipeline Mechanics & Service Communication Scraper (Worker) ──► Cloudflare Queue ──► Python OCR Node
│
Cloudflare D1 ◄── SQL Batch Insert ────────────┤
Cloudflare R2 ◄── Upload Markdown File ────────┤
Vectorize ◄── Embeddings Batch Injection ──┘

Scheduled Trigger: Cloudflare Worker Cron runs every 6 hours and pushes scraping targets into cf-queue-scraping-tasks.Scraper Execution: Playwright headless nodes read tasks, fetch documents/PDFs, upload raw PDFs directly to Cloudflare R2, and publish a job event to cf-queue-ocr-processing.OCR Processing: Python worker consumes the event, pulls the PDF from R2, executes PaddleOCR (Bangla model), extracts tables into CSV/JSON format, and creates clean Markdown text.Data Dispatch: The OCR service pushes output data into three destinations concurrently:Structured metadata into Cloudflare D1.Parsed text chunks ($512$ tokens with $50$ token overlap) into Cloudflare Vectorize using bge-m3 multi-lingual embeddings.Entity relations into Neo4j AuraDB using Cypher queries.6. AI Search & Intelligence Engine (Perplexity-Style Architecture)The system implements a conversational synthesis engine tuned specifically for Bangladeshi civic data. ┌─────────────────────────────┐
│ User Prompt (Bangla/English)│
└──────────────┬──────────────┘
│
▼
┌─────────────────────────────┐
│ 1. Intent & Query Reformulation
│ (Workers AI - Llama 3.1) │
└──────────────┬──────────────┘
│
┌─────────────────────────┴─────────────────────────┐
▼ ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│ 2a. Vector Search │ │ 2b. Full-Text SQL Search │
│ (Cloudflare Vectorize) │ │ (Cloudflare D1 FTS) │
└─────────────────┬─────────────────┘ └─────────────────┬─────────────────┘
│ │
└─────────────────────────┬─────────────────────────┘
│
▼
┌─────────────────────────────┐
│ 3. Hybrid Reranking │
│ (Cross-Encoder) │
└──────────────┬──────────────┘
│
▼
┌─────────────────────────────┐
│ 4. Citation & Answer Engine │
│ (Streaming LLM Generation│
│ with PDF page links) │
└─────────────────────────────┘

AI Pipeline StepsQuery Translation & Intent Detection:Input: "হবিগঞ্জে সম্প্রতি জনস্বাস্থ্য প্রকৌশল অধিদপ্তরের নলকূপ সংক্রান্ত টেন্ডারগুলো কে পেয়েছে?"Workers AI converts this into structured filters:{ "entity": "DPHE", "location": "Habiganj", "item": "tube well", "language": "bn" }Hybrid Retrieval Execution:Semantic Search: Cloudflare Vectorize retrieves top 10 relevant document chunks based on vector distance.Structured Keyword Search: Cloudflare D1 runs SQLite FTS over tender titles and vendor details.Context Assembly & Prompt Injection:Retrieved context is injected into a strict system prompt that enforces citations and prevents hallucinations:System Prompt:
You are ShottoPrakash AI, an investigative civic intelligence assistant for Bangladesh.
Answer the user's question accurately using ONLY the provided context snippets below.
For every claim, tender amount, or vendor name you cite, you MUST include an inline citation reference matching [Source ID].
If the context does not contain enough information, state clearly in plain Bangla that the official records are incomplete.

Context Documents:
[Doc 1] Tender ID 894321 - DPHE Habiganj: Installation of 500 Deep Tube Wells. Awarded to: M/S Rahman Enterprise. Amount: ৳4,50,00,000. Source: R2/gazette_dphe_2024_08.pdf

Streaming Response Generation:Output is streamed to the user interface with interactive footnote tooltips that link directly to the underlying raw PDF document and specific page number stored in Cloudflare R2.7. Anomaly & Mismanagement Detection LogicA. Price Benchmarking (SQL & Vector Match)The system calculates a moving median unit price ($M_u$) for standard items across all historical tenders in D1:$$\text{Anomaly Score} = \frac{P_{\text{tender}} - M_u}{\sigma_u}$$Where $P_{\text{tender}}$ is the unit price listed in a new tender, $M_u$ is the historical median, and $\sigma_u$ is the standard deviation. If the score exceeds $+2.5$, an automated Inflation Risk Alert is generated.B. Vendor Collusion Detection (Neo4j Cypher)To detect instances where multiple dummy companies submit bids to simulate real competition:// Find vendors bidding on the same tenders who share directors or addresses
MATCH (v1:Vendor)-[:BID_ON]->(t:Tender)<-[:BID_ON]-(v2:Vendor)
WHERE v1 <> v2
MATCH (v1)<-[:OWNS_OR_MANAGES]-(d:Director)-[:OWNS_OR_MANAGES]->(v2)
RETURN t.id AS TenderID, v1.name AS Vendor1, v2.name AS Vendor2, d.director_name AS SharedDirector

8. User Interface (UI/UX) Specification1. Main Search & Exploration Interface (Perplexity-Style)┌────────────────────────────────────────────────────────────────────────────────────────┐
   │ ShottoPrakash (সত্যপ্রকাশ) [ Search Gazettes ] [ Anomaly Feeds ] [ Policy Diff ] │
   ├────────────────────────────────────────────────────────────────────────────────────────┤
   │ │
   │ 🔍 Search Bangladesh Public Procurement & Gazettes │
   │ ┌──────────────────────────────────────────────────────────────────┐ │
   │ │ Ask anything... e.g. "PWD Furniture Procurement Anomalies 2024" │ │
   │ └──────────────────────────────────────────────────────────────────┘ │
   │ │
   │ Suggested: [ 🚨 Top 10 Price Inflations ] [ 📄 Police Reform Gazette Breakdown ] │
   │ │
   ├────────────────────────────────────────────────────────────────────────────────────────┤
   │ AI Summary Answer │
   │ ──────────────── │
   │ In 2024, the Public Works Department (PWD) issued 14 tenders for office furniture │
   │ purchases [Source 1]. The average unit cost for executive chairs was ৳32,500, which │
   │ is 310% higher than the cross-ministry baseline average of ৳7,800 [Source 2]. │
   │ │
   │ Key Awardees: │
   │ • M/S Bengal Traders (Won 8 tenders totaling ৳12.4 Crore) [Source 3] │
   │ │
   │ Sources & Citations │
   │ ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────────────────┐ │
   │ │ [1] e-GP Tender 89421 │ │ [2] Budget Digest PDF │ │ [3] Neo4j Vendor Graph │ │
   │ │ PWD Procurement PDF │ │ Ministry of Finance │ │ Shared Director Match │ │
   │ └───────────────────────┘ └───────────────────────┘ └──────────────────────────┘ │
   └────────────────────────────────────────────────────────────────────────────────────────┘

Key UI FeaturesInteractive Source Side-Drawer: Clicking any source card slides out the original scanned PDF with the relevant text highlighted in yellow.Bilingual Toggle: One-click toggle between English and plain, easy-to-understand Bangla explanations.Red Flag Dashboard: A dedicated view ranking procuring entities and vendors by overall anomaly scores, collusion risk factors, and price deviations.Policy Diff Tool: Side-by-side view comparing proposed legal amendments or gazettes against older established policies, highlighting removed or added clauses automatically.
