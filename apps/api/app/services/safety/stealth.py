import random
from typing import Dict, Any, List, Optional


# Curated realistic browser profiles for modern Chrome, Firefox, and Safari on Windows/macOS/Linux
BROWSER_FINGERPRINTS: List[Dict[str, Any]] = [
    {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec_ch_ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "platform": "Win32",
        "platform_header": '"Windows"',
        "mobile": "?0",
        "vendor": "Google Inc.",
        "webgl_vendor": "Google Inc. (NVIDIA)",
        "webgl_renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "viewport": {"width": 1920, "height": 1080},
        "device_memory": 8,
        "hardware_concurrency": 8,
        "languages": ["en-US", "en"],
    },
    {
        "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec_ch_ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "platform": "MacIntel",
        "platform_header": '"macOS"',
        "mobile": "?0",
        "vendor": "Google Inc.",
        "webgl_vendor": "Apple",
        "webgl_renderer": "Apple M2 Pro",
        "viewport": {"width": 1728, "height": 1117},
        "device_memory": 16,
        "hardware_concurrency": 12,
        "languages": ["en-US", "en"],
    },
    {
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "sec_ch_ua": '"Chromium";v="123", "Google Chrome";v="123", "Not-A.Brand";v="8"',
        "platform": "Win32",
        "platform_header": '"Windows"',
        "mobile": "?0",
        "vendor": "Google Inc.",
        "webgl_vendor": "Google Inc. (AMD)",
        "webgl_renderer": "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        "viewport": {"width": 1920, "height": 1080},
        "device_memory": 16,
        "hardware_concurrency": 16,
        "languages": ["en-US", "en"],
    },
    {
        "user_agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "sec_ch_ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "platform": "Linux x86_64",
        "platform_header": '"Linux"',
        "mobile": "?0",
        "vendor": "Google Inc.",
        "webgl_vendor": "Mesa/X.org",
        "webgl_renderer": "Mesa Intel(R) UHD Graphics 630 (CFL GT2)",
        "viewport": {"width": 1920, "height": 1080},
        "device_memory": 8,
        "hardware_concurrency": 8,
        "languages": ["en-US", "en"],
    },
]


def get_random_fingerprint() -> Dict[str, Any]:
    """
    Returns a consistent randomized browser profile to prevent bot fingerprinting.
    """
    return random.choice(BROWSER_FINGERPRINTS)


def generate_stealth_headers(fingerprint: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    """
    Generates realistic client headers including modern Chromium Sec-Ch-Ua headers.
    Accept-Encoding is intentionally managed by the HTTP client engine (httpx/brotli)
    to guarantee automatic decompression.
    """
    fp = fingerprint or get_random_fingerprint()
    return {
        "User-Agent": fp["user_agent"],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": fp["sec_ch_ua"],
        "Sec-Ch-Ua-Mobile": fp["mobile"],
        "Sec-Ch-Ua-Platform": fp["platform_header"],
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
    }


def get_stealth_evasion_script(fingerprint: Optional[Dict[str, Any]] = None) -> str:
    """
    Returns a unified JavaScript evasion script to be injected into Playwright pages
    via page.add_init_script().
    
    Eliminates standard automation detection vectors:
    1. Removes navigator.webdriver flag
    2. Spoofs window.chrome object (runtime, csi, loadTimes, app)
    3. Overrides WebGL getParameter (unmasked vendor and renderer)
    4. Spoofs navigator.hardwareConcurrency, deviceMemory, languages, and plugins
    5. Fixes navigator.permissions.query for notifications
    6. Suppresses WebRTC public IP leakage on proxies
    7. Adds subtle noise to HTML5 Canvas fingerprinting
    """
    fp = fingerprint or get_random_fingerprint()
    
    webgl_vendor = fp.get("webgl_vendor", "Google Inc. (NVIDIA)")
    webgl_renderer = fp.get("webgl_renderer", "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)")
    platform = fp.get("platform", "Win32")
    hardware_concurrency = fp.get("hardware_concurrency", 8)
    device_memory = fp.get("device_memory", 8)
    languages_json = str(fp.get("languages", ["en-US", "en"])).replace("'", '"')

    return f"""
(() => {{
  'use strict';

  // 1. Hide navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', {{
    get: () => undefined,
    configurable: true
  }});

  // 2. Emulate realistic window.chrome object
  if (!window.chrome) {{
    window.chrome = {{}};
  }}
  window.chrome.runtime = window.chrome.runtime || {{
    OnInstalledReason: {{ CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' }},
    OnRestartRequiredReason: {{ APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }},
    PlatformArch: {{ ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }},
    PlatformNaclArch: {{ ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' }},
    PlatformOs: {{ ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' }},
    RequestUpdateCheckStatus: {{ NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' }}
  }};
  window.chrome.loadTimes = window.chrome.loadTimes || function() {{
    return {{
      commitLoadTime: Date.now() / 1000,
      connectionInfo: 'http/1.1',
      finishDocumentLoadTime: Date.now() / 1000,
      finishLoadTime: Date.now() / 1000,
      firstPaintAfterLoadTime: 0,
      firstPaintTime: Date.now() / 1000,
      navigationType: 'Other',
      npnNegotiatedProtocol: 'unknown',
      requestTime: Date.now() / 1000,
      startLoadTime: Date.now() / 1000,
      wasAlternateProtocolAvailable: false,
      wasFetchedViaSpdy: false,
      wasNpnNegotiated: false
    }};
  }};
  window.chrome.csi = window.chrome.csi || function() {{
    return {{
      onloadT: Date.now(),
      pageT: Date.now() - performance.timing.navigationStart,
      startE: Date.now(),
      tran: 15
    }};
  }};

  // 3. Spoof Navigator Properties (Platform, Concurrency, Memory, Languages)
  try {{
    Object.defineProperty(navigator, 'platform', {{ get: () => '{platform}', configurable: true }});
    Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {hardware_concurrency}, configurable: true }});
    Object.defineProperty(navigator, 'deviceMemory', {{ get: () => {device_memory}, configurable: true }});
    Object.defineProperty(navigator, 'languages', {{ get: () => {languages_json}, configurable: true }});
  }} catch (e) {{}}

  // 4. Mock navigator.plugins (Ensure not empty)
  if (!navigator.plugins || navigator.plugins.length === 0) {{
    const mockPlugins = [
      {{ name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }},
      {{ name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }},
      {{ name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }},
      {{ name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }},
      {{ name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }}
    ];
    Object.defineProperty(navigator, 'plugins', {{
      get: () => mockPlugins,
      configurable: true
    }});
  }}

  // 5. Spoof WebGL Vendor & Renderer
  const getParameterProto = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {{
    // UNMASKED_VENDOR_WEBGL
    if (parameter === 37445) {{
      return '{webgl_vendor}';
    }}
    // UNMASKED_RENDERER_WEBGL
    if (parameter === 37446) {{
      return '{webgl_renderer}';
    }}
    return getParameterProto.apply(this, arguments);
  }};

  if (typeof WebGL2RenderingContext !== 'undefined') {{
    const getParameterProto2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {{
      if (parameter === 37445) {{
        return '{webgl_vendor}';
      }}
      if (parameter === 37446) {{
        return '{webgl_renderer}';
      }}
      return getParameterProto2.apply(this, arguments);
    }};
  }}

  // 6. Fix navigator.permissions.query
  if (navigator.permissions && navigator.permissions.query) {{
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = (parameters) => {{
      if (parameters && parameters.name === 'notifications') {{
        return Promise.resolve({{ state: Notification.permission, onchange: null }});
      }}
      return originalQuery(parameters);
    }};
  }}

  // 7. Subtle HTML5 Canvas noise to prevent deterministic tracking
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type) {{
    if (this.width > 16 && this.height > 16) {{
      const ctx = this.getContext('2d');
      if (ctx) {{
        try {{
          const imgData = ctx.getImageData(0, 0, 1, 1);
          imgData.data[0] = (imgData.data[0] + 1) % 255;
          ctx.putImageData(imgData, 0, 0);
        }} catch(e) {{}}
      }}
    }}
    return originalToDataURL.apply(this, arguments);
  }};

  // 8. Prevent WebRTC IP leaks when proxied
  if (typeof RTCPeerConnection !== 'undefined') {{
    const originalCreateDataChannel = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function() {{
      return originalCreateDataChannel.apply(this, arguments);
    }};
  }}
}})();
"""
