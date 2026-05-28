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
    
    # Range: Jan 1 2025 to Jan 31 2025
    post_data = {
        '__CALLBACKID': '__Page',
        '__CALLBACKPARAM': "1||1|1|2025|31|1|2025|0|2|1",
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': generator
    }
    
    # Send Page 1
    opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers))
    
    # Send Page 2 (param = 3)
    opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers))
    
    # Let's try to query deep parameters: 5, 7, 9 under the active session!
    for page_param in [5, 7, 9]:
        post_data['__CALLBACKPARAM'] = f"1||1|1|2025|31|1|2025|0|2|{page_param}"
        print(f"\nRequesting parameter = {page_param}...")
        with opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers)) as resp:
            resp_text = resp.read().decode('utf-8')
            
        print("Response length:", len(resp_text))
        print("First 200 chars:", repr(resp_text[:200]))
        
        # Check if there are articles on this page
        articles = re.findall(r"Getrelease\((\d+),\s*1\)", resp_text)
        print(f"Articles found on parameter {page_param}: {len(articles)}")
        if len(articles) > 0:
            # Print first 2 titles
            titles = re.findall(r"class='link1'>([^<]+)<p", resp_text)
            print("First 2 titles:")
            for t in titles[:2]:
                print("  -", t.strip())
                
        # Find pagination
        match_div = re.search(r"<div class=['\"]r_srch.*$", resp_text)
        if match_div:
            print("Pagination HTML:", match_div.group(0))
            
except Exception as e:
    import traceback
    traceback.print_exc()
