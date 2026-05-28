import os
import sys
import json
import queue
import threading
import asyncio
from datetime import datetime
from fastapi import FastAPI, Query, HTTPException, Header
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import urllib.request
import ssl

# Ensure the parent directory is in the system path so we can import our core scraper class
PARENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(PARENT_DIR)

from pib_scraper import PIBScraper

app = FastAPI(title="PIB Archive Scraper API", version="1.0.0")

# Enable CORS for local cross-origin frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health_check():
    """Simple API status endpoint."""
    return {"status": "ok", "message": "PIB Scraper server is online."}

@app.get("/api/scrape/stream")
async def scrape_stream(
    start: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end: str = Query(..., description="End date (YYYY-MM-DD)"),
    workers: int = Query(10, description="Number of worker threads")
):
    """
    Spawns the scraper in a separate thread and streams live status events
    as standard Server-Sent Events (SSE).
    """
    try:
        start_dt = datetime.strptime(start.strip(), "%Y-%m-%d")
        end_dt = datetime.strptime(end.strip(), "%Y-%m-%d")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}. Use YYYY-MM-DD.")

    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="Start Date must be prior to or equal to End Date.")

    # Thread-safe queue to pass events from scraper thread to main async streaming generator
    event_queue = queue.Queue()

    def progress_callback(event_type, data):
        """Callback fed into the scraper to publish real-time logs to the streaming queue."""
        event_queue.put({"type": event_type, "data": data})

    def run_scraper_thread():
        """Scraper execution pipeline executed inside a background thread."""
        try:
            scraper = PIBScraper(verbose=True)
            
            progress_callback("init", "Initializing secure connection to PIB Archive...")
            scraper.init_session()
            
            # Step 1: Scrape index catalog
            articles = scraper.scrape_articles_index(start_dt, end_dt, on_progress=progress_callback)
            
            if not articles:
                progress_callback("empty", "Zero announcements discovered in target range.")
                event_queue.put(None)  # Sentinel indicating end
                return
                
            # Step 2: Download article full-texts concurrently
            progress_callback("download_start", len(articles))
            completed_dataset = scraper.scrape_article_bodies_concurrent(
                articles, 
                max_workers=workers, 
                on_progress=progress_callback
            )
            
            # Step 3: Complete and publish full dataset payload
            progress_callback("completed", completed_dataset)
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            progress_callback("error", f"An error occurred: {str(e)}")
        finally:
            # Insert a sentinel value to instruct the generator loop that thread finished
            event_queue.put(None)

    # Spawn and trigger the thread
    scraper_thread = threading.Thread(target=run_scraper_thread)
    scraper_thread.daemon = True
    scraper_thread.start()

    async def sse_generator():
        """Asynchronous generator yielding formatted SSE text blocks to the client."""
        while True:
            try:
                # Retrieve items without blocking the main asyncio event loop
                event = event_queue.get_nowait()
                if event is None:
                    break
                # Yield formatted Server-Sent Event
                yield f"data: {json.dumps(event)}\n\n"
            except queue.Empty:
                # Yield control back to event loop for a fraction of a second
                await asyncio.sleep(0.05)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(sse_generator(), media_type="text/event-stream", headers=headers)

@app.post("/api/generate-notes")
async def generate_notes(
    body: dict,
    x_gemini_api_key: str = Header(None, alias="X-Gemini-API-Key")
):
    """
    Calls the official Google Gemini API to analyze article content and generate
    detailed study notes explaining key terms from first principles.
    """
    if not x_gemini_api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key is missing. Configure it in settings.")
        
    article_title = body.get("title", "")
    article_text = body.get("content_text", "")
    
    if not article_text:
        raise HTTPException(status_code=400, detail="Article content text is empty.")
        
    # Construct the prompt
    prompt = f"""You are an elite expert research assistant. Analyze the following Press Information Bureau (PIB) press release and create highly detailed first-principle study notes.

Follow this exact structure:
1. **Target Keywords & Core Concepts**: Identify 2-4 critical technical, economic, scientific, or policy terms/concepts introduced in the article.
2. **First-Principle Explanations**: For each identified keyword, write a comprehensive explanation:
   - **What it is (Simple)**: A high-level, clear definition.
   - **First-Principles Breakdown (Fundamental)**: Explain the core mechanics, underlying science, or absolute foundational concepts from first principles (why does it exist, what are the primary building blocks, how does it work fundamentally?).
   - **Advanced Mechanics & Context (Detailed)**: Dive deep into how it works, technical architectures, economic mechanisms, advanced implications, or implementation details.
3. **Policy & Strategic Significance**: Explain how these concepts connect to India's national development, strategic security, or global position.

Use clean, professional Markdown formatting.

Article Title: {article_title}
Article Content:
{article_text}"""

    # Call Gemini REST API using standard urllib
    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={x_gemini_api_key}"
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }
    
    try:
        encoded_data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            gemini_url,
            data=encoded_data,
            headers={"Content-Type": "application/json"}
        )
        
        # Create unverified context for safety
        ctx = ssl._create_unverified_context()
        with urllib.request.urlopen(req, context=ctx, timeout=45) as response:
            resp_data = json.loads(response.read().decode('utf-8'))
            
        # Extract text response from Gemini response json structure
        candidates = resp_data.get("candidates", [])
        if not candidates:
            raise ValueError("No candidates found in Gemini response. The API key might be invalid or restricted.")
            
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            raise ValueError("No parts found in Gemini response content.")
            
        generated_notes = parts[0].get("text", "")
        return {"notes": generated_notes}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Gemini API Error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    import os
    # Start the server, checking for PORT in environment (vital for Render/hosting)
    port = int(os.environ.get("PORT", 8000))
    # Disable reloading in production mode for optimal performance
    is_production = os.environ.get("ENV") == "production"
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=not is_production)
