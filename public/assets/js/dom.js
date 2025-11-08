// assets/js/dom.js
// Core DOM helpers for our mini-framework

// Single selector
export const $ = (selector) => {
  if (!selector || typeof selector !== "string") {
    console.warn(`${selector} is not a valid selector`);
    return null;
  }
  const el = document.querySelector(selector);
  if (!el) console.warn(`Element not found: ${selector}`);
  return el;
};

// Multiple selectors
export const $$ = (selector) => {
  if (!selector || typeof selector !== "string") {
    console.warn(`${selector} is not a valid selector`);
    return [];
  }
  const els = document.querySelectorAll(selector);
  if (!els.length) console.warn(`No elements found: ${selector}`);
  return els;
};

// Create element with props and children
export const _$ = (tag, props = {}, ...children) => {
  if (typeof tag !== "string") {
    console.warn(`${tag} is not a valid HTML tag`);
    return null;
  }
  const el = document.createElement(tag);

  // Apply props
  for (const key in props) {
    if (key.startsWith("on") && typeof props[key] === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), props[key]);
    } else if (key === "style" && typeof props[key] === "object") {
      Object.assign(el.style, props[key]);
    } else {
      el[key] = props[key];
    }
  }

  // Append children
  children.forEach((child) => {
    if (typeof child === "string") el.appendChild(document.createTextNode(child));
    else if (child instanceof Node) el.appendChild(child);
  });

  return el;
};

// Add event listener safely
export const on = (el, event, callback) => {
  if (!(el instanceof HTMLElement)) return console.warn("Not a valid HTMLElement:", el);
  if (typeof event !== "string") return console.warn("Event type must be a string:", event);
  if (typeof callback !== "function") return console.warn("Callback must be a function:", callback);
  el.addEventListener(event, callback);
};