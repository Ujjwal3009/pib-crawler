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
    
    # Jan 1 2024 to Jan 31 2024 (should have many articles!)
    post_data = {
        '__CALLBACKID': '__Page',
        '__CALLBACKPARAM': "1||1|1|2024|31|1|2024|0|2|1",
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': generator
    }
    
    print("Requesting Jan 2024 Page 1...")
    with opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers)) as resp:
        p1 = resp.read().decode('utf-8')
        
    p1_articles = re.findall(r"Getrelease\((\d+),\s*1\)", p1)
    print("Page 1 articles count:", len(p1_articles))
    
    match_p1_next = re.search(r"onclick=['\"]getSearchPara\((\d+)\)['\"][^>]*>Next</", p1, re.IGNORECASE)
    p1_next = match_p1_next.group(1) if match_p1_next else "None"
    print("Page 1 Next parameter:", p1_next)
    
    if p1_next != "None":
        post_data['__CALLBACKPARAM'] = f"1||1|1|2024|31|1|2024|0|2|{p1_next}"
        print(f"Requesting Page 2 with param {p1_next}...")
        with opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers)) as resp:
            p2 = resp.read().decode('utf-8')
            
        p2_articles = re.findall(r"Getrelease\((\d+),\s*1\)", p2)
        print("Page 2 articles count:", len(p2_articles))
        
        match_p2_next = re.search(r"onclick=['\"]getSearchPara\((\d+)\)['\"][^>]*>Next</", p2, re.IGNORECASE)
        p2_next = match_p2_next.group(1) if match_p2_next else "None"
        print("Page 2 Next parameter:", p2_next)
        
        # If Page 2 Next parameter is not None and is not the current page (p1_next), let's request Page 3!
        if p2_next != "None" and p2_next != p1_next:
            post_data['__CALLBACKPARAM'] = f"1||1|1|2024|31|1|2024|0|2|{p2_next}"
            print(f"Requesting Page 3 with param {p2_next}...")
            with opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers)) as resp:
                p3 = resp.read().decode('utf-8')
                
            p3_articles = re.findall(r"Getrelease\((\d+),\s*1\)", p3)
            print("Page 3 articles count:", len(p3_articles))
            
            match_p3_next = re.search(r"onclick=['\"]getSearchPara\((\d+)\)['\"][^>]*>Next</", p3, re.IGNORECASE)
            p3_next = match_p3_next.group(1) if match_p3_next else "None"
            print("Page 3 Next parameter:", p3_next)
            
except Exception as e:
    import traceback
    traceback.print_exc()
