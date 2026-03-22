/**
 * Walles Selection Summarizer
 * JavaScript snippet for browser extension or embedded editor
 * 
 * Features:
 * - Catches text selection (mouseup)
 * - Shows floating tooltip for 100+ char selections
 * - Hotkey: Ctrl+Shift+S (Cmd+Shift+S on Mac)
 * - Sends to /api/summarize endpoint
 * 
 * Usage:
 *   import { initWallesSelection } from './wallesSelection';
 *   initWallesSelection({ apiBase: 'https://api.example.com' });
 */

(function () {
  'use strict';

  const DEFAULT_CONFIG = {
    apiBase: window.location.origin,
    minChars: 100,
    maxChars: 50000,
    hotkey: { key: 'S', ctrl: true, shift: true },
    tooltipOffset: { x: 15, y: -10 },
    tooltipTimeout: 300,
    debounceMs: 500,
    styles: {
      tooltipBg: '#1a1a2e',
      tooltipColor: '#fff',
      tooltipBorder: '#4a4a6a',
      tooltipShadow: '0 4px 20px rgba(0,0,0,0.3)',
      buttonBg: '#6366f1',
      buttonHoverBg: '#4f46e5',
      loadingColor: '#a5b4fc',
    },
  };

  let config = { ...DEFAULT_CONFIG };
  let tooltipElement = null;
  let selectionData = null;
  let debounceTimer = null;
  let isLoading = false;

  function log(...args) {
    if (config.debug) console.log('[Walles]', ...args);
  }

  function extend(target, source) {
    if (typeof Object.assign !== 'function') {
      Object.defineProperty(target, 'key', {
        value: source.key || target.key,
        writable: true,
        configurable: true,
      });
      target.ctrl = source.ctrl !== undefined ? source.ctrl : target.ctrl;
      target.shift = source.shift !== undefined ? source.shift : target.shift;
      return target;
    }
    return Object.assign(target, source);
  }

  function isHotkeyPressed(event) {
    const hotkey = config.hotkey;
    
    const ctrlMatch = hotkey.ctrl 
      ? (event.ctrlKey || event.metaKey) 
      : (!event.ctrlKey && !event.metaKey);
    
    const shiftMatch = hotkey.shift ? event.shiftKey : !event.shiftKey;
    const keyMatch = event.key.toUpperCase() === hotkey.key.toUpperCase();

    return ctrlMatch && shiftMatch && keyMatch;
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return '';
    
    const text = selection.toString().trim();
    return text;
  }

  function createTooltipStyles() {
    if (document.getElementById('walles-tooltip-styles')) return;

    const style = document.createElement('style');
    style.id = 'walles-tooltip-styles';
    style.textContent = `
      .walles-tooltip {
        position: absolute;
        z-index: 2147483647;
        background: ${config.styles.tooltipBg};
        color: ${config.styles.tooltipColor};
        border: 1px solid ${config.styles.tooltipBorder};
        border-radius: 8px;
        padding: 8px 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        box-shadow: ${config.styles.tooltipShadow};
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: opacity 0.15s ease, transform 0.15s ease;
        animation: walles-tooltip-appear 0.2s ease-out;
        max-width: 300px;
      }
      
      .walles-tooltip:hover {
        background: #252542;
      }
      
      .walles-tooltip:active {
        transform: scale(0.98);
      }
      
      .walles-tooltip-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      
      .walles-tooltip-text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .walles-tooltip-shortcut {
        background: rgba(255,255,255,0.15);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        opacity: 0.8;
      }
      
      .walles-tooltip.loading .walles-tooltip-text::after {
        content: '';
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-left: 8px;
        border: 2px solid ${config.styles.loadingColor};
        border-top-color: transparent;
        border-radius: 50%;
        animation: walles-spin 0.8s linear infinite;
        vertical-align: middle;
      }
      
      @keyframes walles-tooltip-appear {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes walles-spin {
        to { transform: rotate(360deg); }
      }
      
      .walles-result-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 2147483647;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: walles-modal-fade 0.2s ease;
      }
      
      .walles-result-modal.hidden {
        display: none;
      }
      
      .walles-result-content {
        background: #fff;
        border-radius: 12px;
        max-width: 600px;
        width: 100%;
        max-height: 80vh;
        overflow: auto;
        box-shadow: 0 25px 50px rgba(0,0,0,0.25);
        animation: walles-modal-slide 0.3s ease;
      }
      
      .walles-result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
      }
      
      .walles-result-header h3 {
        margin: 0;
        font-size: 16px;
        color: #1a1a2e;
      }
      
      .walles-result-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #6b7280;
        padding: 0;
        line-height: 1;
      }
      
      .walles-result-body {
        padding: 20px;
        font-size: 14px;
        line-height: 1.6;
        color: #374151;
        white-space: pre-wrap;
      }
      
      .walles-result-body code {
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'SF Mono', Monaco, monospace;
      }
      
      .walles-result-footer {
        padding: 12px 20px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      
      .walles-result-btn {
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        border: none;
        transition: background 0.15s;
      }
      
      .walles-result-btn.primary {
        background: ${config.styles.buttonBg};
        color: #fff;
      }
      
      .walles-result-btn.primary:hover {
        background: ${config.styles.buttonHoverBg};
      }
      
      .walles-result-btn.secondary {
        background: #f3f4f6;
        color: #374151;
      }
      
      @keyframes walles-modal-fade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes walles-modal-slide {
        from { opacity: 0; transform: scale(0.95) translateY(-20px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  function createTooltip(text) {
    removeTooltip();

    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    const tooltip = document.createElement('div');
    tooltip.className = 'walles-tooltip';
    tooltip.innerHTML = `
      <svg class="walles-tooltip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
      <span class="walles-tooltip-text">Summarize ${text.length} chars</span>
      <span class="walles-tooltip-shortcut">${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Shift+S</span>
    `;

    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    tooltip.style.left = `${rect.right + config.tooltipOffset.x + scrollX}px`;
    tooltip.style.top = `${rect.top + config.tooltipOffset.y + scrollY}px`;

    tooltip.addEventListener('click', () => {
      handleSummarize(text);
    });

    document.body.appendChild(tooltip);
    tooltipElement = tooltip;

    selectionData = { text, range: range.cloneRange() };

    log('Tooltip created for selection:', text.length, 'chars');
  }

  function removeTooltip() {
    if (tooltipElement) {
      tooltipElement.remove();
      tooltipElement = null;
    }
    selectionData = null;
  }

  function showResultModal(summary) {
    const existingModal = document.querySelector('.walles-result-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'walles-result-modal';
    modal.innerHTML = `
      <div class="walles-result-content">
        <div class="walles-result-header">
          <h3>Walles Summary</h3>
          <button class="walles-result-close" aria-label="Close">&times;</button>
        </div>
        <div class="walles-result-body">${escapeHtml(summary)}</div>
        <div class="walles-result-footer">
          <button class="walles-result-btn secondary copy-btn">Copy</button>
          <button class="walles-result-btn primary close-btn">Close</button>
        </div>
      </div>
    `;

    modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
    modal.querySelector('.walles-result-close').addEventListener('click', () => modal.remove());
    modal.querySelector('.copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(summary);
      modal.querySelector('.copy-btn').textContent = 'Copied!';
      setTimeout(() => {
        modal.querySelector('.copy-btn').textContent = 'Copy';
      }, 2000);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
    modal.focus();

    log('Result modal shown');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function handleSummarize(text) {
    if (isLoading) return;

    if (!config.apiKey) {
      log('No API key configured');
      showResultModal('Please configure your API key to use Walles summarizer.');
      return;
    }

    isLoading = true;
    removeTooltip();

    if (tooltipElement) {
      tooltipElement.classList.add('loading');
      tooltipElement.querySelector('.walles-tooltip-text').textContent = 'Generating...';
    }

    log('Starting summarization for', text.length, 'chars');

    try {
      const response = await fetch(`${config.apiBase}/api/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model: config.model || 'gpt-3.5-turbo',
          length: config.length || 'medium',
          apiKey: config.apiKey,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Summarization failed');
      }

      const data = await response.json();
      log('Summary generated successfully');

      showResultModal(data.summary || data.text || 'No summary available');

    } catch (error) {
      log('Summarization error:', error);
      showResultModal(`Error: ${error.message}`);
    } finally {
      isLoading = false;
      if (tooltipElement) {
        tooltipElement.classList.remove('loading');
      }
    }
  }

  function handleSelectionChange() {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      const text = getSelectedText();

      if (!text || text.length < config.minChars) {
        removeTooltip();
        return;
      }

      if (text.length > config.maxChars) {
        log('Selection too long:', text.length, 'chars (max:', config.maxChars + ')');
        createTooltip(text.substring(0, 100) + '...');
        return;
      }

      createTooltip(text);
    }, config.debounceMs);
  }

  function handleKeydown(event) {
    if (isHotkeyPressed(event)) {
      const text = getSelectedText();

      if (!text || text.length < config.minChars) {
        log('Hotkey pressed but no valid selection');
        return;
      }

      event.preventDefault();
      log('Hotkey triggered summarization');
      handleSummarize(text);
    }

    if (event.key === 'Escape' && tooltipElement) {
      removeTooltip();
    }
  }

  function handleClick(event) {
    if (tooltipElement && !tooltipElement.contains(event.target)) {
      removeTooltip();
    }
  }

  function handleScroll() {
    if (tooltipElement && selectionData) {
      const selection = window.getSelection();
      if (selection.rangeCount) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const scrollX = window.scrollX || document.documentElement.scrollLeft;
        const scrollY = window.scrollY || document.documentElement.scrollTop;

        tooltipElement.style.left = `${rect.right + config.tooltipOffset.x + scrollX}px`;
        tooltipElement.style.top = `${rect.top + config.tooltipOffset.y + scrollY}px`;
      }
    }
  }

  function init(options = {}) {
    config = {
      ...DEFAULT_CONFIG,
      ...options,
    };

    if (config.hotkey) {
      config.hotkey = extend(DEFAULT_CONFIG.hotkey, config.hotkey);
    }

    createTooltipStyles();

    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });

    log('Walles Selection initialized', {
      minChars: config.minChars,
      hotkey: `${config.hotkey.ctrl ? 'Ctrl+' : ''}${config.hotkey.shift ? 'Shift+' : ''}${config.hotkey.key}`,
    });

    return {
      destroy,
      updateConfig: (newConfig) => {
        config = { ...config, ...newConfig };
      },
      summarize: (text) => handleSummarize(text),
    };
  }

  function destroy() {
    removeTooltip();
    document.removeEventListener('mouseup', handleSelectionChange);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('click', handleClick);
    window.removeEventListener('scroll', handleScroll);
    log('Walles Selection destroyed');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initWallesSelection: init, destroy };
  } else {
    window.initWallesSelection = init;
    window.destroyWallesSelection = destroy;
  }

})();
