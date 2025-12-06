// ==UserScript==
// @name         TexPage Zen Mode
// @namespace    http://tampermonkey.net/
// @version      0.3.3
// @description  Zen mode for TexPage (Toggle Lint-Bar, Header, Line Numbers, Fullscreen) - Fix !important override
// @author       Chengde Qian & Modified
// @match        *://www.texpage.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration: Selectors ---
    const SELECTORS = {
        TOOLBAR: '.editor-actions',
        HEADER: '.project-header',
        LINENUMS: '.cm-gutters',       // 包含行号的主容器
        SIDEBAR_TARGET: '.cm-gutter-lint' // Lint 侧边条
    };

    const BUTTON_CLASS = 'tp-zen-button';

    // --- Icons (SVG) ---
    const SVG_ATTRS = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';

    const ICON_SIDEBAR = `<svg ${SVG_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>`;
    const ICON_LINENUMS = `<svg ${SVG_ATTRS}><path d="M3 6h18M3 12h18M3 18h18"/></svg>`;
    const ICON_HEADER = `<svg ${SVG_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>`;
    const ICON_FULLSCREEN = `<svg ${SVG_ATTRS}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;

    // --- CSS Styles ---
    const customCSS = `
        ::-webkit-scrollbar { width: 6px; height: 6px; background-color: transparent; }
        ::-webkit-scrollbar-track:hover { background-color: rgba(0, 0, 0, .1); }
        ::-webkit-scrollbar-thumb { background-clip: border-box; background-color: rgba(0, 0, 0, .2); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background-color: rgba(0, 0, 0, .3); }

        .${BUTTON_CLASS} {
            background-color: transparent !important;
            color: #d1d5db;
            width: 34px;
            height: 34px;
            border: none;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s, background-color 0.2s;
            margin-left: 5px;
            border-radius: 4px;
        }
        .${BUTTON_CLASS}:hover {
            /* 修改 2: 悬停时变为纯白 */
            color: #ffffff;
            /* 修改 3: 悬停背景改为淡淡的白色半透明，增加发光感 */
            background-color: rgba(255,255,255,0.15) !important;
        }
        :fullscreen { background-color: #fff; overflow-y: auto; }
    `;

    // --- Helper Functions ---

    function triggerResizePulse() {
        setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 100);
        setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 500);
    }

    /**
     * 强力切换显示/隐藏
     * 针对设置了 display: flex !important 的元素，我们也必须用 !important 覆盖
     */
    function toggleDisplay(selector) {
        const els = document.querySelectorAll(selector);
        els.forEach(el => {
            // 检查当前的内联样式是否是 none
            if (el.style.display === 'none') {
                // 如果是隐藏状态 -> 恢复显示
                // 直接移除 display 属性，让原本的 CSS (flex !important) 重新生效
                el.style.removeProperty('display');

                // 特殊兜底：如果移除属性后它还是隐藏（极其少见的情况），强制设为 flex
                // 但通常 removeProperty 是最安全的，因为它尊重了原始网页的 layout 定义
            } else {
                // 如果是显示状态 -> 强制隐藏
                // 使用 setProperty 加上 priority 'important' 来击败网页原本的 CSS
                el.style.setProperty('display', 'none', 'important');
            }
        });
        triggerResizePulse();
    }

    // 专门用于强制隐藏的辅助函数
    function forceHide(selector) {
        const els = document.querySelectorAll(selector);
        els.forEach(el => {
            el.style.setProperty('display', 'none', 'important');
        });
    }

    function isFullscreen() {
        return document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
    }

    function toggleFullScreen() {
        const doc = window.document;
        const docEl = doc.documentElement;

        if (!isFullscreen()) {
            const request = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
            if (request) request.call(docEl).then(() => triggerResizePulse());
        } else {
            const cancel = doc.exitFullscreen || doc.mozCancelFullScreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
            if (cancel) cancel.call(doc).then(() => triggerResizePulse());
        }
    }

    function createButton(iconHtml, title, onClick) {
        const btn = document.createElement('button');
        btn.innerHTML = iconHtml;
        btn.title = title;
        btn.className = BUTTON_CLASS;
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClick(btn);
        };
        return btn;
    }

    function waitForElement(selector, callback) {
        const el = document.querySelector(selector);
        if (el) {
            callback(el);
        } else {
            setTimeout(() => waitForElement(selector, callback), 500);
        }
    }

    // --- Main Logic ---
    function init() {
        GM_addStyle(customCSS);

        // 1. 默认隐藏 Lint Bar (使用强制隐藏)
        forceHide(SELECTORS.SIDEBAR_TARGET);

        const buttons = [
            // Sidebar 按钮 -> 控制 Lint Bar
            createButton(ICON_SIDEBAR, "Toggle Lint Bar", () => {
                toggleDisplay(SELECTORS.SIDEBAR_TARGET);
            }),

            // Line Numbers 按钮 -> 控制 cm-gutters
            createButton(ICON_LINENUMS, "Toggle Line Numbers", () => {
                toggleDisplay(SELECTORS.LINENUMS);
            }),

            // Header 按钮
            createButton(ICON_HEADER, "Toggle Header", () => {
                toggleDisplay(SELECTORS.HEADER);
            }),

            // Fullscreen 按钮
            createButton(ICON_FULLSCREEN, "Toggle Fullscreen", () => {
                toggleFullScreen();
            })
        ];

        waitForElement(SELECTORS.TOOLBAR, (toolbar) => {
            buttons.forEach(btn => toolbar.appendChild(btn));

            // 双重保险：加载完成后再次强制隐藏 Lint Bar，防止时序问题
            setTimeout(() => {
                forceHide(SELECTORS.SIDEBAR_TARGET);
            }, 1000);

            console.log("TexPage Zen Mode Loaded (Force Mode).");
        });
    }

    waitForElement(SELECTORS.TOOLBAR, init);

})();
