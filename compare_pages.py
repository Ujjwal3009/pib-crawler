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
    
    # Send Page 1
    post_data = {
        '__CALLBACKID': '__Page',
        '__CALLBACKPARAM': "1||1|1|2025|31|1|2025|0|2|1",
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': generator
    }
    with opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers)) as resp:
        p1 = resp.read().decode('utf-8')
        
    # Send Page 2 (param = 3)
    post_data['__CALLBACKPARAM'] = "1||1|1|2025|31|1|2025|0|2|3"
    with opener.open(urllib.request.Request(url, data=urllib.parse.urlencode(post_data).encode('utf-8'), headers=headers)) as resp:
        p2 = resp.read().decode('utf-8')
        
    p1_titles = re.findall(r"class='link1'>([^<]+)<p", p1)
    p2_titles = re.findall(r"class='link1'>([^<]+)<p", p2)
    
    print("Page 1 titles:")
    for i, t in enumerate(p1_titles[:3]):
        print(f"  {i+1}: {t.strip()[:80]}...")
        
    print("\nPage 2 titles:")
    for i, t in enumerate(p2_titles[:3]):
        print(f"  {i+1}: {t.strip()[:80]}...")
        
    # Are Page 1 and Page 2 identical?
    set1 = set(p1_titles)
    set2 = set(p2_titles)
    overlap = set1.intersection(set2)
    print(f"\nPage 1 titles: {len(set1)}, Page 2 titles: {len(set2)}")
    print(f"Overlap between Page 1 and Page 2: {len(overlap)} articles.")
    
except Exception as e:
    import traceback
    traceback.print_exc()
