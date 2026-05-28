# Press Information Bureau (PIB) India Scraper & Dashboard Suite

A premium, full-stack data crawling and analysis suite designed to scrape, compile, and visualize press releases from the official **Press Information Bureau (PIB) India Archive** (`https://archive.pib.gov.in/archive2/AdvSearch.aspx`).

It provides a dual-layer interface: a powerful, high-performance command-line interface (CLI) for batch scraping, and a gorgeous, responsive frosted-glass React dashboard equipped with real-time status logging and interactive reading panes.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────┐
│                   React Frontend App                   │
│  - Frosted-glass dark mode theme (Tailwind CSS v4)    │
│  - Live streaming log console (EventSource SSE)        │
│  - Interactive article catalog (Search, ministry filters)│
│  - Slide-out reading pane with direct text copy        │
└──────────────────────────┬─────────────────────────────┘
                           │ GET /api/scrape/stream (SSE)
                           ▼
┌────────────────────────────────────────────────────────┐
│               FastAPI Backend API Server               │
│  - Spawns scraper pipelines in background threads     │
│  - Publishes real-time logs to thread-safe queues      │
│  - Streams JSON logs as standard text/event-streams    │
└──────────────────────────┬─────────────────────────────┘
                           │ In-process Imports
                           ▼
┌────────────────────────────────────────────────────────┐
│                    Scraper Core CLI                    │
│  - Emulates dynamic ASP.NET Client Callbacks           │
│  - Tracks __VIEWSTATE & ASP.NET_SessionId cookies      │
│  - Multithreaded body downloads (ThreadPoolExecutor)  │
└────────────────────────────────────────────────────────┘
```

---

## 📁 Workspace Directory Structure

```
pib_scraper/
├── backend/
│   ├── server.py           # FastAPI Server module
│   └── requirements.txt    # Backend dependencies
├── frontend/               # Vite React SPA
│   ├── src/
│   │   ├── App.jsx         # Premium Dashboard Container
│   │   ├── main.jsx        # Mounting entry point
│   │   └── index.css       # Global design tokens & styling
│   ├── package.json
│   ├── vite.config.js      # Tailwind configurations
│   └── index.html
├── pib_scraper.py          # Core scraper engine & CLI module
└── README.md               # Upgraded documentation
```

---

## 🚀 Setup & Launch Guide

To run the application locally on your Mac, follow these simple steps:

### 1. Start the FastAPI Backend
Open a new terminal window, navigate to the `backend` folder, and launch the server using `uvicorn`:

```bash
cd /Users/ujjwalkumar/.gemini/antigravity/scratch/pib_scraper/backend
python3 -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```
*The API will start running on **`http://localhost:8000`**.*

### 2. Start the React Frontend Dev Server
Open a second terminal window, navigate to the `frontend` folder, and launch the Vite development server:

```bash
cd /Users/ujjwalkumar/.gemini/antigravity/scratch/pib_scraper/frontend
npm run dev
```
*The dashboard will compile and open instantly on **`http://localhost:5173`**.*

---

## 🖥️ Using the React Dashboard

1. **Parameters Selection**: Select your desired start date, end date, and tuning workers (thread pool size) inside the glass control card.
2. **Launch Scraper**: Click the **Initialize Scraper Engine** button. 
3. **Live Streaming Console**: A custom styled terminal will drop down in real-time, streaming logs directly from the scraper (session setup, pagination indices, concurrent thread downloads, final compilation). A progress bar tracks complete status.
4. **Interactive Dashboard**: Once completed, the app transitions into a searchable grid:
   - **Keyword Search**: Live search across release titles and body texts.
   - **Ministry Filtering**: Dynamically populated filter dropdown to view only specific ministries.
   - **Reading Pane**: Select any article in the left panel to load its complete cleaned text on the right side.
   - **Utility Controls**: Copy cleaned plain text to your clipboard with one click, open the official PIB source url, or download the entire range as a structured JSON file.

---

## ⚙️ Batch Scraping via CLI

If you prefer to run batch scrapes directly in your terminal, the core script retains its robust CLI operation:

```bash
cd /Users/ujjwalkumar/.gemini/antigravity/scratch/pib_scraper
python3 pib_scraper.py --start-date YYYY-MM-DD --end-date YYYY-MM-DD [options]
```

### CLI Parameters

| Flag | Short | Description |
| :--- | :--- | :--- |
| `--start-date` | `-s` | **Required.** Starting date (Supports `YYYY-MM-DD` or `DD-MM-YYYY` formats). |
| `--end-date` | `-e` | **Required.** Ending date (Supports `YYYY-MM-DD` or `DD-MM-YYYY` formats). |
| `--output` | `-o` | Output file path. Defaults to `./output/pib_articles_<start>_to_<end>.json`. |
| `--workers` | `-w` | Number of concurrent downloader threads (default: `10`). |
| `--verbose` | `-v` | Enable detailed terminal logs. |

#### CLI Batch Example:
```bash
python3 pib_scraper.py --start-date 2026-05-20 --end-date 2026-05-25 --output output/pib_batch.json --workers 15
```

---

## 💎 Output JSON Schema

All scrapers (CLI and Dashboard) compile articles into a standardized high-fidelity dataset:

```json
[
  {
    "article_id": "289238",
    "title": "Prime Minister shares glimpses from the Padma Awards ceremony",
    "datetime": "25-May-2026:11:22:59",
    "date": "2026-05-25",
    "url": "https://archive.pib.gov.in/archive2/AdvSearch.aspx?relid=289238",
    "ministry": "Prime Minister's Office",
    "header_raw": "Prime Minister's Office 25-May, 2026 23:19 IST",
    "content_html": "<div style='text-align:center;font-weight:600...'>...</div>",
    "content_text": "Prime Minister shares glimpses from the Padma Awards ceremony\n\nPrime Minister Shri Narendra Modi today shared glimpses..."
  }
]
```
