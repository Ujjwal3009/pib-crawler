import urllib.request
import urllib.parse
import re
import ssl
from http.cookiejar import CookieJar
from datetime import datetime, timedelta

url = "https://archive.pib.gov.in/archive2/AdvSearch.aspx"
headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

try:
    context = ssl._create_unverified_context()
    cj = CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cj),
        urllib.request.HTTPSHandler(context=context)
    )
    
    # Fetch initial page to get viewstate
    req = opener.open(urllib.request.Request(url, headers=headers))
    html = req.read().decode('utf-8')
    viewstate = re.search(r'id="__VIEWSTATE"\s+value="([^"]*)"', html).group(1)
    generator = re.search(r'id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"', html).group(1)
    
    # We will query day-by-day for Jan 1, Jan 2, and Jan 3, 2025
    all_articles = []
    
    for day_offset in range(3):
        target_date = datetime(2025, 1, 1) + timedelta(days=day_offset)
        day = target_date.day
        month = target_date.month
        year = target_date.year
        
        # Query for this specific single day
        param = f"1||{day}|{month}|{year}|{day}|{month}|{year}|0|2|1"
        post_data = {
            '__CALLBACKID': '__Page',
            '__CALLBACKPARAM': param,
            '__VIEWSTATE': viewstate,
            '__VIEWSTATEGENERATOR': generator
        }
        
        encoded_data = urllib.parse.urlencode(post_data).encode('utf-8')
        req_post = urllib.request.Request(url, data=encoded_data, headers=headers)
        
        with opener.open(req_post) as response:
            resp_text = response.read().decode('utf-8')
            
        # Parse articles
        pattern = r"Getrelease\((\d+),\s*1\)'[^>]*>(.*?)<p class='feaDate'>\s*\((.*?)\)</p>"
        matches = re.findall(pattern, resp_text, re.DOTALL | re.IGNORECASE)
        
        print(f"Date: {target_date.strftime('%Y-%m-%d')} - Articles found: {len(matches)}")
        for relid, title_raw, date_raw in matches[:2]:
            title = title_raw.replace(' class=\'link1\'>', '').strip()
            print(f"  - [{relid}] {title[:60]}...")
            
        all_articles.extend(matches)
        
    print(f"\nTotal unique articles gathered over 3 separate days: {len(all_articles)}")
    
except Exception as e:
    import traceback
    traceback.print_exc()
