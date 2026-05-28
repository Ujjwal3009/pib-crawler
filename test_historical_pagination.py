import urllib.request
import urllib.parse
import re
import ssl
from http.cookiejar import CookieJar

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
    
    # 1. Fetch initial viewstate
    req = opener.open(urllib.request.Request(url, headers=headers))
    html = req.read().decode('utf-8')
    viewstate = re.search(r'id="__VIEWSTATE"\s+value="([^"]*)"', html).group(1)
    generator = re.search(r'id="__VIEWSTATEGENERATOR"\s+value="([^"]*)"', html).group(1)
    
    # Let's query a huge range in the past: Jan 1 2025 to Jan 31 2025 (there must be hundreds of articles!)
    # Format: 1|SearchText|FromDate|FromMonth|FromYear|ToDate|ToMonth|ToYear|minID|searchtype|calledfromvalue
    
    # Page 1 request (param = 1)
    post_data = {
        '__CALLBACKID': '__Page',
        '__CALLBACKPARAM': "1||1|1|2025|31|1|2025|0|2|1",
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': generator
    }
    
    print("Requesting Jan 2025 Page 1...")
    with opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers)) as resp:
        p1_html = resp.read().decode('utf-8')
        
    p1_articles = re.findall(r"Getrelease\((\d+),\s*1\)", p1_html)
    print("Page 1 articles count:", len(p1_articles))
    
    match_p1_next = re.search(r"onclick=['\"]getSearchPara\((\d+)\)['\"][^>]*>Next</", p1_html, re.IGNORECASE)
    p1_next = match_p1_next.group(1) if match_p1_next else "None"
    print("Page 1 Next parameter:", p1_next)
    
    # Let's request the next page using the parameter returned (which should be 3, or maybe something else?)
    if p1_next != "None":
        post_data['__CALLBACKPARAM'] = f"1||1|1|2025|31|1|2025|0|2|{p1_next}"
        print(f"\nRequesting Jan 2025 Page 2 with parameter {p1_next}...")
        with opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers)) as resp:
            p2_html = resp.read().decode('utf-8')
            
        p2_articles = re.findall(r"Getrelease\((\d+),\s*1\)", p2_html)
        print("Page 2 articles count:", len(p2_articles))
        
        match_p2_next = re.search(r"onclick=['\"]getSearchPara\((\d+)\)['\"][^>]*>Next</", p2_html, re.IGNORECASE)
        p2_next = match_p2_next.group(1) if match_p2_next else "None"
        print("Page 2 Next parameter:", p2_next)
        
        # Let's inspect the pagination div of Page 2 to see if there is another next!
        match_div = re.search(r"<div class=['\"]r_srch.*$", p2_html)
        if match_div:
            print("Page 2 Pagination HTML:")
            print(match_div.group(0))
            
except Exception as e:
    import traceback
    traceback.print_exc()
