import re
from typing import Optional
from urllib.parse import urlparse
from selectolax.lexbor import LexborHTMLParser as HTMLParser


INSPECTOR_SCRIPT = """
<style>
.__pith_hover_highlight {
  outline: 2px solid #10b981 !important;
  outline-offset: 1px !important;
  background-color: rgba(16, 185, 129, 0.12) !important;
  cursor: crosshair !important;
}
.__pith_selected_highlight {
  outline: 2px solid #3b82f6 !important;
  outline-offset: 1px !important;
  background-color: rgba(59, 130, 246, 0.18) !important;
}
.__pith_container_highlight {
  outline: 2px dashed #f59e0b !important;
  outline-offset: 2px !important;
  background-color: rgba(245, 158, 11, 0.08) !important;
}
</style>
<script>
(function() {
  let activeElement = null;
  let containerSelector = null;
  let mode = 'field'; // 'field' | 'container'

  function getCleanCssPath(el) {
    if (!(el instanceof Element)) return '';
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id && !/^[0-9]/.test(el.id)) {
        selector += '#' + el.id;
        path.unshift(selector);
        break;
      } else {
        let sib = el, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() === selector) nth++;
        }
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.trim().split(/\\s+/)
            .filter(c => c && !c.startsWith('__pith') && !c.includes(':') && c.length < 35);
          if (classes.length > 0) {
            selector += '.' + classes.slice(0, 2).join('.');
          }
        }
      }
      path.unshift(selector);
      el = el.parentNode;
      if (!el || el.nodeName.toLowerCase() === 'body' || el.nodeName.toLowerCase() === 'html') break;
    }
    return path.join(' > ');
  }

  function getRelativePath(child, container) {
    if (!container || !container.contains(child) || child === container) {
      return getCleanCssPath(child);
    }
    const path = [];
    let curr = child;
    while (curr && curr !== container) {
      let tag = curr.nodeName.toLowerCase();
      if (curr.className && typeof curr.className === 'string') {
        const classes = curr.className.trim().split(/\\s+/)
          .filter(c => c && !c.startsWith('__pith') && !c.includes(':') && c.length < 35);
        if (classes.length > 0) {
          tag += '.' + classes.slice(0, 2).join('.');
        }
      }
      path.unshift(tag);
      curr = curr.parentElement;
    }
    return path.join(' > ');
  }

  document.addEventListener('mouseover', function(e) {
    if (activeElement) activeElement.classList.remove('__pith_hover_highlight');
    activeElement = e.target;
    if (activeElement && activeElement !== document.body && activeElement !== document.documentElement) {
      activeElement.classList.add('__pith_hover_highlight');
    }
  }, true);

  document.addEventListener('mouseout', function(e) {
    if (e.target) e.target.classList.remove('__pith_hover_highlight');
  }, true);

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    if (!target) return;

    const fullSelector = getCleanCssPath(target);
    let count = 0;
    try {
      count = document.querySelectorAll(fullSelector).length;
    } catch(err) {}

    const payload = {
      type: 'pith:element_selected',
      mode: mode,
      selector: fullSelector,
      tag: target.nodeName.toLowerCase(),
      text: (target.innerText || target.textContent || '').trim().slice(0, 150),
      src: target.getAttribute('src') || target.getAttribute('data-src') || null,
      href: target.getAttribute('href') || null,
      alt: target.getAttribute('alt') || null,
      matchCount: count,
      className: typeof target.className === 'string' ? target.className : ''
    };

    window.parent.postMessage(payload, '*');
  }, true);

  window.addEventListener('message', function(e) {
    const data = e.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'pith:highlight_selector') {
      document.querySelectorAll('.__pith_selected_highlight').forEach(el => el.classList.remove('__pith_selected_highlight'));
      if (data.selector) {
        try {
          document.querySelectorAll(data.selector).forEach(el => el.classList.add('__pith_selected_highlight'));
        } catch(err) {}
      }
    } else if (data.type === 'pith:highlight_container') {
      document.querySelectorAll('.__pith_container_highlight').forEach(el => el.classList.remove('__pith_container_highlight'));
      if (data.selector) {
        try {
          containerSelector = data.selector;
          document.querySelectorAll(data.selector).forEach(el => el.classList.add('__pith_container_highlight'));
        } catch(err) {}
      }
    } else if (data.type === 'pith:set_mode') {
      mode = data.mode || 'field';
    }
  });

  window.parent.postMessage({ type: 'pith:inspector_ready' }, '*');
})();
</script>
"""


def sanitize_html_for_preview(html: str, base_url: str) -> str:
    """
    Strips executable scripts and dangerous inline event handlers,
    injects <base href> for styles/images, and adds the visual picker inspector bridge.
    """
    if not html:
        return "<html><body><p style='color:#888; font-family:monospace; padding:20px;'>No preview available</p></body></html>"

    # Remove all script tags
    sanitized = re.sub(r"<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>", "", html, flags=re.IGNORECASE)
    
    # Remove inline event attributes (onclick, onload, onerror, etc.)
    sanitized = re.sub(r'\s+on[a-z]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)', "", sanitized, flags=re.IGNORECASE)
    
    # Remove iframe and frame tags
    sanitized = re.sub(r"<\/?(?:iframe|frame)\b[^>]*>", "", sanitized, flags=re.IGNORECASE)
    
    # Ensure <base href="..."> in head
    base_tag = f'<base href="{base_url}">'
    if "<head" in sanitized.lower():
        sanitized = re.sub(r"(<head[^>]*>)", r"\1\n  " + base_tag, sanitized, count=1, flags=re.IGNORECASE)
    else:
        sanitized = f"<head>{base_tag}</head>\n" + sanitized

    # Inject the inspector CSS & script before </body> or at the end
    body_idx = sanitized.lower().rfind("</body>")
    if body_idx != -1:
        sanitized = sanitized[:body_idx] + INSPECTOR_SCRIPT + "\n" + sanitized[body_idx:]
    else:
        sanitized = sanitized + "\n" + INSPECTOR_SCRIPT

    return sanitized
