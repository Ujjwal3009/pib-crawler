#!/usr/bin/env python3
"""
PIB Archive Scraper
A premium, zero-dependency CLI tool to scrape articles from the Press Information Bureau (PIB)
India Archive between two specified dates and compile them into a high-fidelity JSON dataset.

Author: Antigravity AI
"""

import argparse
import sys
import os
import re
import json
import ssl
import html
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from http.cookiejar import CookieJar
from concurrent.futures import ThreadPoolExecutor, as_completed

# ANSI Terminal Colors for Premium CLI experience
COLOR_HEADER = "\033[95m"
COLOR_BLUE = "\033[94m"
COLOR_GREEN = "\033[92m"
COLOR_YELLOW = "\033[93m"
COLOR_FAIL = "\033[91m"
COLOR_END = "\033[0m"
COLOR_BOLD = "\033[1m"

def log_info(msg):
    print(f"{COLOR_BLUE}[INFO]{COLOR_END} {msg}")

def log_success(msg):
    print(f"{COLOR_GREEN}[SUCCESS]{COLOR_END} {COLOR_BOLD}{msg}{COLOR_END}")

def log_warning(msg):
    print(f"{COLOR_YELLOW}[WARNING]{COLOR_END} {msg}")

def log_error(msg):
    print(f"{COLOR_FAIL}[ERROR]{COLOR_END} {msg}", file=sys.stderr)

class PIBScraper:
    """
    Core PIB Scraper using dynamic ASP.NET client callbacks and session cookie persistence.
    """
    BASE_URL = "https://archive.pib.gov.in/archive2/AdvSearch.aspx"
    
    def __init__(self, verbose=False):
        self.verbose = verbose
        # Create unverified SSL context as government sites can have certificate issues
        self.ssl_context = ssl._create_unverified_context()
        self.cookie_jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar),
            urllib.request.HTTPSHandler(context=self.ssl_context)
        )
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        self.viewstate = ""
        self.generator = ""
        
    def _make_request(self, url, data=None):
        """Sends an HTTP GET or POST request using the session opener."""
        req = urllib.request.Request(url, data=data, headers=self.headers)
        with self.opener.open(req, timeout=30) as response:
            return response.read().decode('utf-8')

    def init_session(self):
        """Fetches the landing page to establish the session cookie and extract viewstate."""
        if self.verbose:
            log_info("Initializing session and establishing cookies...")
        try:
            html_content = self._make_request(self.BASE_URL)
            
            viewstate_match = re.search(r'id="__VIEWSTATE"\s+value="([^"]*)"', html_content)
            generator_match = re.search(r'id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"', html_content)
            
            self.viewstate = viewstate_match.group(1) if viewstate_match else ""
            self.generator = generator_match.group(1) if generator_match else ""
            
            if not self.viewstate:
                raise ValueError("Could not find __VIEWSTATE in the HTML response.")
                
            if self.verbose:
                cookies = [c.name + '=' + c.value for c in self.cookie_jar]
                log_info(f"Session established. Cookies: {cookies}")
                log_info(f"Extracted ViewState (length: {len(self.viewstate)}), Generator: {self.generator}")
                
        except Exception as e:
            log_error(f"Failed to initialize PIB session: {e}")
            raise

    def clean_html(self, raw_html):
        """Cleans and formats HTML content into premium clean markdown/text."""
        if not raw_html:
            return ""
        
        # Replace line breaks and paragraphs with clean newlines
        s = re.sub(r'<br\s*/?>', '\n', raw_html, flags=re.IGNORECASE)
        s = re.sub(r'</p\s*>', '\n\n', s, flags=re.IGNORECASE)
        s = re.sub(r'<p[^>]*>', '', s, flags=re.IGNORECASE)
        
        # Strip all other HTML tags
        s = re.sub(r'<[^>]+>', '', s)
        
        # Unescape HTML entities (e.g., &nbsp;, &amp;)
        s = html.unescape(s)
        
        # Format spacing, normalize multiple newlines to max 2 newlines
        lines = [line.strip() for line in s.split('\n')]
        formatted = []
        for line in lines:
            if line:
                formatted.append(line)
            elif not formatted or formatted[-1] != "":
                formatted.append("")
                
        cleaned = "\n".join(formatted).strip()
        return cleaned

    def fetch_index_page(self, start_date, end_date, page_param):
        """Queries a single page index using standard ASP.NET client callback."""
        # Payload format: 1|SearchText|FromDate|FromMonth|FromYear|ToDate|ToMonth|ToYear|minID|searchtype|calledfromvalue
        param = f"1||{start_date.day}|{start_date.month}|{start_date.year}|{end_date.day}|{end_date.month}|{end_date.year}|0|2|{page_param}"
        
        post_data = {
            '__CALLBACKID': '__Page',
            '__CALLBACKPARAM': param,
            '__VIEWSTATE': self.viewstate,
            '__VIEWSTATEGENERATOR': self.generator
        }
        
        encoded_data = urllib.parse.urlencode(post_data).encode('utf-8')
        resp_text = self._make_request(self.BASE_URL, data=encoded_data)
        
        # ASP.NET success callback responses begin with "0|1|" or "0|2|" etc.
        parts = resp_text.split('|', 2)
        if len(parts) < 3:
            raise ValueError(f"Unexpected response format: {resp_text[:100]}")
            
        html_part = parts[2]
        return html_part

    def scrape_articles_index(self, start_date, end_date, on_progress=None):
        """Scrapes the entire article catalog day-by-day to bypass the server's 40-article limit."""
        articles = []
        unique_relids = set()
        
        # Calculate list of all dates in the range
        delta = end_date - start_date
        total_days = delta.days + 1
        
        log_info(f"Searching index day-by-day from {start_date.strftime('%d-%b-%Y')} to {end_date.strftime('%d-%b-%Y')} ({total_days} days)...")
        if on_progress:
            on_progress("indexing_start", f"Searching day-by-day index ({total_days} days)...")
            
        for i in range(total_days):
            target_date = start_date + timedelta(days=i)
            date_str = target_date.strftime('%Y-%m-%d')
            
            # Print inline or update progress
            if self.verbose:
                log_info(f"[{i+1}/{total_days}] Fetching articles for {date_str}...")
            else:
                sys.stdout.write(f"\r{COLOR_BLUE}[INFO]{COLOR_END} Scanning dates... [{i+1}/{total_days}] ({date_str})")
                sys.stdout.flush()
                
            if on_progress:
                on_progress("indexing", f"Scanning {target_date.strftime('%d-%b-%Y')}... ({i+1}/{total_days})")
                
            # Perform single day crawl (handling potential pagination for that day)
            day_articles = []
            current_param = 1
            visited_params = set()
            
            while current_param and current_param not in visited_params:
                visited_params.add(current_param)
                
                try:
                    html_part = self.fetch_index_page(target_date, target_date, current_param)
                    
                    if "No Record found for this search" in html_part:
                        break
                        
                    # Parse articles on the current page
                    pattern = r"Getrelease\((\d+),\s*1\)'[^>]*>(.*?)<p class='feaDate'>\s*\((.*?)\)</p>"
                    matches = re.findall(pattern, html_part, re.DOTALL | re.IGNORECASE)
                    
                    for relid, title_raw, date_raw in matches:
                        if relid in unique_relids:
                            continue
                        unique_relids.add(relid)
                        
                        title = title_raw.replace(' class=\'link1\'>', '').strip()
                        title = html.unescape(title)
                        
                        # Normalize date format from (25-May-2026:11:22:59)
                        date_clean = date_raw.strip()
                        
                        # Parse date string to ISO format
                        iso_date = ""
                        try:
                            dt = datetime.strptime(date_clean, "%d-%b-%Y:%H:%M:%S")
                            iso_date = dt.strftime("%Y-%m-%d")
                        except ValueError:
                            try:
                                dt = datetime.strptime(date_clean.split(':')[0], "%d-%b-%Y")
                                iso_date = dt.strftime("%Y-%m-%d")
                            except Exception:
                                pass
                        
                        day_articles.append({
                            "article_id": relid,
                            "title": title,
                            "datetime": date_clean,
                            "date": iso_date,
                            "url": f"https://archive.pib.gov.in/archive2/AdvSearch.aspx?relid={relid}"
                        })
                        
                    # Extract pagination Next parameter
                    next_match = re.search(r"onclick=['\"]getSearchPara\((\d+)\)['\"][^>]*>Next</", html_part, re.IGNORECASE)
                    
                    if next_match:
                        next_param = int(next_match.group(1))
                        if next_param == current_param:
                            break
                        current_param = next_param
                    else:
                        break
                        
                except Exception as e:
                    log_warning(f"Error fetching index for {date_str}: {e}")
                    break
                    
            articles.extend(day_articles)
            
        # Clean terminal output line if using carriage return
        if not self.verbose:
            print("\r", end="", flush=True)
            
        log_success(f"Discovered {len(articles)} articles across {total_days} days.")
        if on_progress:
            on_progress("indexing_completed", len(articles))
        return articles

    def fetch_article_body(self, article, index, total):
        """Fetches the full text and ministry header for an article."""
        article_id = article["article_id"]
        # Callback param: 2|ArticleID|1
        param = f"2|{article_id}|1"
        
        post_data = {
            '__CALLBACKID': '__Page',
            '__CALLBACKPARAM': param,
            '__VIEWSTATE': self.viewstate,
            '__VIEWSTATEGENERATOR': self.generator
        }
        
        encoded_data = urllib.parse.urlencode(post_data).encode('utf-8')
        
        try:
            resp_text = self._make_request(self.BASE_URL, data=encoded_data)
            
            # Response: 0|2|Ministry & Date |<div ...>
            parts = resp_text.split('|', 3)
            if len(parts) < 4:
                raise ValueError("Unexpected content callback structure.")
                
            header = parts[2].strip()
            content_html = parts[3].strip()
            
            # Extract ministry from the header
            # Header typically looks like: "Prime Minister's Office 25-May, 2026 23:19 IST "
            # We split by the first appearance of a digit/date indicator to get the ministry name
            ministry = header
            date_index_match = re.search(r'\d', header)
            if date_index_match:
                ministry = header[:date_index_match.start()].strip()
                
            cleaned_text = self.clean_html(content_html)
            
            # Return updated article details
            updated_article = article.copy()
            updated_article.update({
                "ministry": ministry,
                "header_raw": header,
                "content_html": content_html,
                "content_text": cleaned_text
            })
            
            if self.verbose:
                log_info(f"[{index}/{total}] Successfully fetched body for Article ID: {article_id}")
            else:
                # Thread-safe printing for inline progress
                sys.stdout.write(f"\r{COLOR_BLUE}[INFO]{COLOR_END} Downloading bodies... [{index}/{total}] ({int(index/total*100)}%)")
                sys.stdout.flush()
                
            return updated_article
            
        except Exception as e:
            log_warning(f"Failed to fetch content for Article {article_id}: {e}")
            # Return fallback details
            fallback = article.copy()
            fallback.update({
                "ministry": "Unknown",
                "header_raw": "",
                "content_html": "",
                "content_text": "",
                "error": str(e)
            })
            return fallback

    def scrape_article_bodies_concurrent(self, articles, max_workers=10, on_progress=None):
        """Downloads full texts for all articles in parallel using a ThreadPool."""
        if not articles:
            return []
            
        log_info(f"Downloading full text for {len(articles)} articles using {max_workers} worker threads...")
        if on_progress:
            on_progress("download_start", len(articles))
            
        completed_articles = []
        total = len(articles)
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Map futures to preserve indexing
            futures = {
                executor.submit(self.fetch_article_body, article, i + 1, total): i 
                for i, article in enumerate(articles)
            }
            
            completed_count = 0
            for future in as_completed(futures):
                try:
                    result = future.result()
                    completed_articles.append(result)
                    completed_count += 1
                    if on_progress:
                        on_progress("downloading", {
                            "completed": completed_count,
                            "total": total,
                            "percent": int(completed_count / total * 100),
                            "latest_title": result.get("title", "")
                        })
                except Exception as e:
                    idx = futures[future]
                    log_error(f"Thread execution failed for article index {idx}: {e}")
                    
        # Ensure we clear the progress line
        print("\r", end="", flush=True)
        log_success(f"Successfully downloaded full texts for {len(completed_articles)}/{total} articles.")
        if on_progress:
            on_progress("download_completed", len(completed_articles))
            
        # Sort back by original index order if needed, but here we just sort by date descending
        completed_articles.sort(key=lambda x: x.get("datetime", ""), reverse=True)
        return completed_articles

def parse_date(date_str):
    """Parses date string in YYYY-MM-DD or DD-MM-YYYY format."""
    for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue
    raise argparse.ArgumentTypeError(f"Invalid date format: '{date_str}'. Use YYYY-MM-DD or DD-MM-YYYY.")

def main():
    parser = argparse.ArgumentParser(
        description="Premium PIB Archive Scraper CLI. Scrapes Press Information Bureau India articles into JSON.",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument(
        "--start-date", "-s",
        required=True,
        type=parse_date,
        help="Start Date (YYYY-MM-DD or DD-MM-YYYY)"
    )
    parser.add_argument(
        "--end-date", "-e",
        required=True,
        type=parse_date,
        help="End Date (YYYY-MM-DD or DD-MM-YYYY)"
    )
    parser.add_argument(
        "--output", "-o",
        type=str,
        default=None,
        help="Output JSON file path (defaults to ./output/pib_articles_<start>_to_<end>.json)"
    )
    parser.add_argument(
        "--workers", "-w",
        type=int,
        default=10,
        help="Number of concurrent downloader threads (default: 10)"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable highly detailed verbose logs"
    )
    
    args = parser.parse_args()
    
    # Validation: Start date must be before or equal to End date
    if args.start_date > args.end_date:
        log_error("Invalid parameters: Start Date must be prior to or equal to End Date.")
        sys.exit(1)
        
    start_str = args.start_date.strftime("%Y-%m-%d")
    end_str = args.end_date.strftime("%Y-%m-%d")
    
    # Establish default output path if none is supplied
    if not args.output:
        os.makedirs("./output", exist_ok=True)
        args.output = f"./output/pib_articles_{start_str}_to_{end_str}.json"
    else:
        # Create output directories if specified in custom path
        parent_dir = os.path.dirname(args.output)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
            
    print(f"\n{COLOR_HEADER}{COLOR_BOLD}=== Press Information Bureau Archive Scraper ==={COLOR_END}\n")
    log_info(f"Target Range: {start_str} to {end_str}")
    log_info(f"Output File : {args.output}")
    log_info(f"Concurrency : {args.workers} worker threads")
    
    try:
        scraper = PIBScraper(verbose=args.verbose)
        
        # 1. Start Session
        scraper.init_session()
        
        # 2. Extract Indexes
        index_articles = scraper.scrape_articles_index(args.start_date, args.end_date)
        
        if not index_articles:
            log_warning("No articles discovered in the specified range. Exiting.")
            sys.exit(0)
            
        # 3. Download Full Article Texts
        full_dataset = scraper.scrape_article_bodies_concurrent(index_articles, max_workers=args.workers)
        
        # 4. Save to JSON
        log_info(f"Compiling and writing to JSON dataset...")
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(full_dataset, f, ensure_ascii=False, indent=2)
            
        log_success(f"Success! Saved {len(full_dataset)} high-fidelity articles to {args.output}")
        print()
        
    except KeyboardInterrupt:
        print()
        log_warning("Process interrupted by user. Exiting gracefully.")
        sys.exit(1)
    except Exception as e:
        print()
        log_error(f"Fatal error during scraper execution: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
