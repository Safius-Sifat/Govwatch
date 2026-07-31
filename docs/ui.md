Frontend UI Selection & Visual Feature Architecture for ShottoPrakash1. Executive Recommendation: Why Choose Morphic?For ShottoPrakash, Morphic is the absolute best open-source foundation to fork and adapt. ┌─────────────────────────────────────────────────────────────┐
│ WHY MORPHIC WINS │
├─────────────────────────────────────────────────────────────┤
│ 1. Built on Next.js 14, Tailwind CSS, & Vercel AI SDK │
│ 2. Native Perplexity-style citation & source card architecture│
│ 3. Unopinionated modular code (easy to inject custom PDF │
│ viewers, graph visualizations, and anomaly badges) │
│ 4. Native SSE streaming with generative UI widget support │
└─────────────────────────────────────────────────────────────┘

Why Other Alternatives Rank Secondary for This Use CasePerplexica: Excellent out-of-the-box search engine, but its backend is heavily tightly-coupled with SearXNG and Node.js. Modifying its core data model to handle Neo4j supplier graphs and e-GP tender schemas requires fighting against its internal architecture.Open WebUI: Highly feature-rich, but it is designed primarily as a ChatGPT clone / workspace manager. Its UI puts source citations in small footnotes rather than prominent primary cards.LibreChat: Excellent multi-user workspace, but too heavy and ChatGPT-centric for a public-facing search & intelligence engine where instant source verifiability is paramount.2. Feature Matrix: Stock Morphic vs. Customized ShottoPrakashFeatureStock MorphicCustomized ShottoPrakash (Morphic Fork)Primary InteractionConversational Search BarConversational Search + Specialized Search Mode TogglesCitationsWeb Search URLsInteractive PDF Bounding-Box Cards (Doc ID + Page #)Generative WidgetsBasic charts & tablesAnomaly Rating Badges, Price Comparison Sliders, Vendor Relationship CardsSide-Pane ViewModal source viewerDual-Pane Layout: Answers on Left, Raw Scanned Gazette / PDF on RightLanguage ToggleSingle system languageInstant Bangla ↔ English Toggle3. Visual UI Wireframe & Desktop Layout┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ShottoPrakash (সত্যপ্রকাশ) [Search Mode: 🎯 Tenders | 📜 Gazettes | 🕸️ Vendors] [ Bangla | EN ] │
├───────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ │
│ 🔍 [ Ask about tenders, price inflations, or gazettes... e.g., "DPHE Habiganj tube wells 2024" ] │
│ │
├─────────────────────────────────────────────────────────┬─────────────────────────────────────────────────┤
│ LEFT PANE: AI SUMMARY & ANOMALY INTELLIGENCE │ RIGHT PANE: PROOF & SOURCE RECEIPTS │
├─────────────────────────────────────────────────────────┼─────────────────────────────────────────────────┤
│ │ 📄 Active Source PDF: gazette_dphe_2024_08.pdf │
│ 🚨 ALERT: High Inflation Flag Detected │ ┌─────────────────────────────────────────────┐ │
│ ────────────────────────────────────────────────────── │ │ [Page 3 of 12] │ │
│ Unit Cost Deviation: +310% above baseline ($z = 3.2$) │ │ │ │
│ │ │ ...গণপ্রজাতন্ত্রী বাংলাদেশ সরকার │ │
│ 💬 Answer Summary (Bangla) │ │ জনস্বাস্থ্য প্রকৌশল অধিদপ্তর │ │
│ ────────────────────────────── │ │ ┌──────────────────────────────────────┐ │ │
│ ২০২৪ সালের আগস্টে জনস্বাস্থ্য প্রকৌশল অধিদপ্তর (DPHE) │ │ │ নলকূপ স্থাপন প্রকল্প: বরাদ্দ ৪,৫০,০০,০০০ │ │ │
│ হবিগঞ্জ জেলায় ৫০০টি গভীর নলকূপ ক্রয়ের জন্য ৪.৫ কোটি │ │ └──────────────────────────────────────┘ │ │
│ টাকার টেন্ডার অনুমোদন করে [Source 1]। │ │ (Highlighted yellow segment matches │ │
│ │ │ citation anchor Doc 1) │ │
│ সর্বনিম্ন দরদাতা M/S Rahman Enterprise-কে কাজ দেওয়া হয় │ └─────────────────────────────────────────────┘ │
│ [Source 2], যার স্বত্বাধিকারীর সাথে অন্য ২ দরদাতার │ │
│ একই ব্যাংক অ্যাকাউন্ট সম্পর্কিত তথ্য রয়েছে [Source 3]। │ 🕸️ Vendor Collusion Graph Snippet │
│ │ ┌─────────────────────────────────────────────┐ │
│ 📊 Unit Price Breakdown Widget │ │ (Vendor A) ──[Shared NID]──► (Director X) │ │
│ ┌─────────────────────────────────────────────────────┐ │ │ │ │ │
│ │ Item: Deep Tube Well (150m) │ │ (Vendor B) ──[Shared Address]──┘ │ │
│ │ Awarded Rate: ৳90,000 [████████████████] │ └─────────────────────────────────────────────┘ │
│ │ Baseline Median: ৳28,000 [████] │ │
│ └─────────────────────────────────────────────────────┘ │ │
│ │ │
│ 📑 Citation Cards │ │
│ ┌───────────────────┐ ┌───────────────────┐ │ │
│ │ [1] e-GP 894321 │ │ [2] Award Record │ │ │
│ │ Page 3 | DPHE │ │ Page 1 | Contract │ │ │
│ └───────────────────┘ └───────────────────┘ │ │
└─────────────────────────────────────────────────────────┴─────────────────────────────────────────────────┘

4. Complete Feature Breakdown by ComponentA. The Smart Search & Intent HeaderSearch Mode Switcher: Allows users to focus the query scope before typing:🎯 Procurement & Tenders: Focuses RAG execution strictly on e-GP pricing and item schedules.📜 Legal & Gazettes: Focuses on BG Press ordinances, policy changes, and ministry circulars.🕸️ Vendor Audit: Queries the Neo4j graph for vendor directors, shared TIN/NID numbers, and cross-bidding patterns.Bilingual Toggle: Dynamic state switch that instructs the backend system prompt to generate output in either formal/plain Bangla or English without requiring a page refresh.B. Generative UI Widgets (Custom React Components inside Morphic)Instead of returning block text, the modified Morphic stream injects rich React components based on query findings:Price Anomaly Gauge Widget:Renders whenever an item price exceeds historical medians.Displays the awarded unit price versus the national benchmark ($M_u$) alongside calculated standard deviations ($z$-score).Vendor Collusion Card:Automatically renders when Neo4j detects linked bids.Displays director names, shared registered addresses, and flag warnings (e.g., "3 out of 4 bidding companies share Director NID XXXXX").Policy Diff Widget:Renders when analyzing gazette amendments.Shows a side-by-side comparison of added clauses (green) and repealed clauses (red).C. The "Receipts" Side Drawer (Interactive Source Viewer)Direct Page Anchoring: Clicking any [Source X] badge in the answer stream instantly opens the corresponding raw scanned PDF on the right-hand panel, auto-scrolling to the exact page and highlighting the source paragraph in yellow.PDF Download & SHA-256 Verifier: Displays the cryptographic hash of the Cloudflare R2 stored file to prove the document has not been altered since scraping.5. Implementation Roadmap: Modifying MorphicTo transform standard Morphic into ShottoPrakash UI, perform the following targeted modifications: Step 1: Replace Default Search Engine API
   └── Point Morphic's `/api/search` route to your Cloudflare Worker / FastAPI Gateway.

Step 2: Extend AI SDK Stream Protocols
└── Configure server-sent events (SSE) to yield structured JSON objects containing
`citations`, `anomaly_scores`, and `graph_edges` alongside standard text deltas.

Step 3: Inject Custom Generative UI Components
└── Register `<PriceAnomalyCard />`, `<VendorGraphWidget />`, and `<PdfViewerPane />`
inside Next.js `useUIState` hooks.

Step 4: Implement Dual-Pane Responsive Layout
└── Update Tailwind layout grid (`grid-cols-1 lg:grid-cols-2`) to support full-width PDF
side-by-side inspection on desktop screens.
