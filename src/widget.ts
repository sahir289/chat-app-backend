import type { Request, Response } from "express";
import prisma from "./lib/prisma";
import { urlsConfig } from "./config/urlsConfig";

function getBackendBaseUrl(req: Request) {
  const envUrl = process.env.WIDGET_BACKEND_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  const host = req.get("host");
  const protocol = req.protocol || "http";
  return `${protocol}://${host}`;
}

export async function widgetScriptHandler(req: Request, res: Response) {
  const widgetKey = (req.query.widgetKey as string) || "";
  const backendBase = getBackendBaseUrl(req);
  const embedUrl =
    urlsConfig.widgetEmbedUrl || `${backendBase.replace(/\/+$/, "")}/embed`;

  if (!widgetKey) {
    res.status(400).send("// Missing widgetKey parameter");
    return;
  }

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");

  const script = `
(function () {
  var WIDGET_KEY = ${JSON.stringify(widgetKey)};
  var BACKEND = ${JSON.stringify(backendBase)};
  var EMBED_URL = ${JSON.stringify(embedUrl)};
  var iframe = null;
  var launcherButton = null;
  var layoutListenersBound = false;
  var widgetPosition = "right"; // Default to right, will be updated from settings
  var launcherButtonColor = "#292555"; // Default color, will be updated from settings

  // Normalize color to hex format (handles rgb, rgba, hex)
  function normalizeColorToHex(color) {
    if (!color || typeof color !== "string") {
      return "#292555"; // Default fallback
    }
    color = color.trim();
    
    // Already hex format
    if (color.startsWith("#")) {
      // Handle 3-character hex codes (e.g., #fff -> #ffffff)
      if (color.length === 4) {
        color = "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      }
      // Handle 8-character hex codes with alpha (e.g., #6366f150 -> #6366f1)
      if (color.length === 9 && /^#[0-9A-Fa-f]{8}$/.test(color)) {
        return color.substring(0, 7); // Strip alpha channel
      }
      // Validate hex format (6 characters after #)
      if (color.length === 7 && /^#[0-9A-Fa-f]{6}$/.test(color)) {
        return color;
      }
    }
    
    // Handle rgb/rgba format: rgb(99, 102, 241) or rgba(99, 102, 241, 0.5)
    var rgbMatch = color.match(/^rgba?\((\d+),[\s]*(\d+),[\s]*(\d+)(?:,[\s]*[0-9.]+)?\)$/i);
    if (rgbMatch) {
      var r = parseInt(rgbMatch[1], 10);
      var g = parseInt(rgbMatch[2], 10);
      var b = parseInt(rgbMatch[3], 10);
      // Convert to hex
      var hex = "#" + 
        ("0" + r.toString(16)).slice(-2) +
        ("0" + g.toString(16)).slice(-2) +
        ("0" + b.toString(16)).slice(-2);
      return hex;
    }
    
    // If no # prefix, try adding it
    if (!color.startsWith("#") && /^[0-9A-Fa-f]{3,6}$/.test(color)) {
      if (color.length === 3) {
        color = "#" + color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
      } else if (color.length === 6) {
        color = "#" + color;
      }
      if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return color;
      }
    }
    
    // Default fallback for invalid format
    return "#292555";
  }

  // Convert hex color to rgba for box shadow
  function hexToRgba(hex, alpha) {
    // Normalize to hex first
    hex = normalizeColorToHex(hex);
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  function isSmallViewport() {
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    return vw <= 640;
  }

  function updateLauncherLayout() {
    if (!launcherButton) return;

    var isLeft = widgetPosition === "left";

    if (isSmallViewport()) {
      launcherButton.style.bottom = "12px";
      if (isLeft) {
        launcherButton.style.left = "12px";
        launcherButton.style.right = "auto";
      } else {
        launcherButton.style.right = "12px";
        launcherButton.style.left = "auto";
      }
      launcherButton.style.width = "52px";
      launcherButton.style.height = "52px";
    } else {
      launcherButton.style.bottom = "20px";
      if (isLeft) {
        launcherButton.style.left = "20px";
        launcherButton.style.right = "auto";
      } else {
        launcherButton.style.right = "20px";
        launcherButton.style.left = "auto";
      }
      launcherButton.style.width = "56px";
      launcherButton.style.height = "56px";
    }
  }

  function updateContainerLayout(container) {
    if (!container) return;

    var vw = window.innerWidth || document.documentElement.clientWidth || 400;
    var vh = window.innerHeight || document.documentElement.clientHeight || 700;
    var isLeft = widgetPosition === "left";

    if (isSmallViewport()) {
      container.style.left = "8px";
      container.style.right = "8px";
      container.style.top = "8px";
      container.style.bottom = "8px";
      container.style.width = "auto";
      container.style.height = "auto";
      container.style.borderRadius = "16px";
    } else {
      var width = Math.min(400, Math.max(320, vw - 40));
      var height = Math.min(600, Math.max(480, vh - 40));

      container.style.left = "auto";
      container.style.top = "auto";
      if (isLeft) {
        container.style.left = "20px";
        container.style.right = "auto";
      } else {
        container.style.right = "20px";
        container.style.left = "auto";
      }
      container.style.bottom = "20px";
      container.style.width = width + "px";
      container.style.height = height + "px";
      // Match frontend panel radius (~16px) to avoid corner masking.
      container.style.borderRadius = "16px";
    }
  }

  function syncWidgetLayout() {
    updateLauncherLayout();
    var container = document.getElementById("serviots-chat-container");
    if (container) {
      updateContainerLayout(container);
    }
  }

  function bindLayoutListeners() {
    if (layoutListenersBound) return;
    layoutListenersBound = true;
    window.addEventListener("resize", syncWidgetLayout);
    window.addEventListener("orientationchange", syncWidgetLayout);
  }

  function updateLauncherButtonColor() {
    if (!launcherButton) {
      return;
    }
    // Use setProperty with important flag to override any host page CSS
    launcherButton.style.setProperty("background", launcherButtonColor, "important");
    launcherButton.style.setProperty("background-color", launcherButtonColor, "important");
    launcherButton.style.setProperty("box-shadow", "0 8px 30px " + hexToRgba(launcherButtonColor, 0.5), "important");
    
    // Update hover handlers with new color if they exist
    if (launcherButton._mouseEnterHandler) {
      launcherButton.removeEventListener("mouseenter", launcherButton._mouseEnterHandler);
    }
    if (launcherButton._mouseLeaveHandler) {
      launcherButton.removeEventListener("mouseleave", launcherButton._mouseLeaveHandler);
    }
    
    launcherButton._mouseEnterHandler = function() {
      this.style.setProperty("transform", "scale(1.05)", "important");
      this.style.setProperty("box-shadow", "0 12px 40px " + hexToRgba(launcherButtonColor, 0.6), "important");
    };
    
    launcherButton._mouseLeaveHandler = function() {
      this.style.setProperty("transform", "scale(1)", "important");
      this.style.setProperty("box-shadow", "0 8px 30px " + hexToRgba(launcherButtonColor, 0.5), "important");
    };
    
    launcherButton.addEventListener("mouseenter", launcherButton._mouseEnterHandler);
    launcherButton.addEventListener("mouseleave", launcherButton._mouseLeaveHandler);
  }

  function createLauncherButton() {
    // Remove existing launcher if any
    var existing = document.getElementById("serviots-chat-launcher");
    if (existing) {
      existing.remove();
    }

    launcherButton = document.createElement("button");
    launcherButton.id = "serviots-chat-launcher";
    launcherButton.innerHTML = '<svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>';
    launcherButton.style.position = "fixed";
    launcherButton.style.width = "56px";
    launcherButton.style.height = "56px";
    launcherButton.style.borderRadius = "50%";
    // Use setProperty with important flag to override any host page CSS
    launcherButton.style.setProperty("background", launcherButtonColor, "important");
    launcherButton.style.setProperty("background-color", launcherButtonColor, "important");
    launcherButton.style.border = "0";
    launcherButton.style.cursor = "pointer";
    launcherButton.style.zIndex = "999998";
    launcherButton.style.setProperty("box-shadow", "0 8px 30px " + hexToRgba(launcherButtonColor, 0.5), "important");
    launcherButton.style.display = "flex";
    launcherButton.style.alignItems = "center";
    launcherButton.style.justifyContent = "center";
    launcherButton.style.color = "white";
    launcherButton.style.transition = "all 0.2s";
    launcherButton.title = "Open chat";
    launcherButton.setAttribute("aria-label", "Open chat");

    launcherButton._mouseEnterHandler = function() {
      this.style.setProperty("transform", "scale(1.05)", "important");
      this.style.setProperty("box-shadow", "0 12px 40px " + hexToRgba(launcherButtonColor, 0.6), "important");
    };

    launcherButton._mouseLeaveHandler = function() {
      this.style.setProperty("transform", "scale(1)", "important");
      this.style.setProperty("box-shadow", "0 8px 30px " + hexToRgba(launcherButtonColor, 0.5), "important");
    };

    launcherButton.addEventListener("mouseenter", launcherButton._mouseEnterHandler);
    launcherButton.addEventListener("mouseleave", launcherButton._mouseLeaveHandler);

    launcherButton.addEventListener("click", function() {
      injectIframe();
      hideLauncher();
    });

    document.body.appendChild(launcherButton);
    // Ensure color is applied with !important flag
    updateLauncherButtonColor();
    updateLauncherLayout();
    bindLayoutListeners();
  }

  function hideLauncher() {
    if (launcherButton) {
      launcherButton.style.display = "none";
    }
  }

  function showLauncher() {
    if (launcherButton) {
      launcherButton.style.display = "flex";
    } else {
      createLauncherButton();
    }
  }

  function closeIframe() {
    var container = document.getElementById("serviots-chat-container");
    if (container) {
      container.remove();
      iframe = null;
      showLauncher();
    } else if (iframe) {
      iframe.remove();
      iframe = null;
      showLauncher();
    }
  }

  function injectIframe() {
    // Check if iframe already exists
    var existing = document.getElementById("serviots-chat-widget");
    if (existing) {
      return;
    }

    // Create container for iframe and buttons
    var container = document.createElement("div");
    container.id = "serviots-chat-container";
    container.style.position = "fixed";
    container.style.bottom = "20px";
    container.style.width = "400px";
    container.style.height = "600px";
    container.style.zIndex = "999999";
    // Add background that matches widget design to prevent white flash
    container.style.background = "linear-gradient(180deg, #F4F7FF 0%, #FFFFFF 100%)";
    // Match frontend panel radius (~16px) to avoid corner masking.
    container.style.borderRadius = "16px";
    // Ensure a consistent visible frame on all sides.
    container.style.boxSizing = "border-box";
    container.style.border = "1px solid rgba(226, 232, 240, 0.9)";
    // Put shadow on the container so border stays visible.
    container.style.boxShadow = "0 10px 40px rgba(0,0,0,0.2)";
    container.style.overflow = "hidden";
    updateContainerLayout(container);

    // Create loading placeholder (matches widget design)
    var loadingPlaceholder = document.createElement("div");
    loadingPlaceholder.id = "serviots-loading-placeholder";
    loadingPlaceholder.style.width = "100%";
    loadingPlaceholder.style.height = "100%";
    loadingPlaceholder.style.background = "linear-gradient(180deg, #F4F7FF 0%, #FFFFFF 100%)";
    loadingPlaceholder.style.display = "flex";
    loadingPlaceholder.style.alignItems = "center";
    loadingPlaceholder.style.justifyContent = "center";
    loadingPlaceholder.style.borderRadius = "inherit";
    loadingPlaceholder.style.position = "absolute";
    loadingPlaceholder.style.top = "0";
    loadingPlaceholder.style.left = "0";
    loadingPlaceholder.style.zIndex = "1";
    loadingPlaceholder.innerHTML = '<div style="text-align: center; color: #64748b;"><div style="width: 40px; height: 40px; border: 3px solid #e2e8f0; border-top-color: #292555; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px;"></div><div style="font-size: 14px; font-weight: 500;">Loading chat...</div></div>';
    
    // Add spin animation
    var style = document.createElement("style");
    style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(style);

    iframe = document.createElement("iframe");
    iframe.id = "serviots-chat-widget";
    iframe.src = EMBED_URL + "?widgetKey=" + encodeURIComponent(WIDGET_KEY);
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "0";
    iframe.style.borderRadius = "inherit";
    iframe.style.overflow = "hidden";
    iframe.style.boxShadow = "none";
    iframe.style.background = "linear-gradient(180deg, #F4F7FF 0%, #FFFFFF 100%)";
    iframe.style.opacity = "0";
    iframe.style.transition = "opacity 0.4s ease-in";
    iframe.style.position = "absolute";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.zIndex = "2";
    iframe.title = "Mitra Varta Chat Widget";
    iframe.allow = "clipboard-read; clipboard-write";
    iframe.loading = "eager";
    
    // Show iframe when loaded, hide placeholder - show immediately for faster load
    iframe.addEventListener("load", function() {
      if (iframe && iframe.parentNode) {
        iframe.style.opacity = "1";
        loadingPlaceholder.style.display = "none";
      }
    });
    
    // Fallback: if load event doesn't fire, show after 300ms (reduced from 1000ms)
    setTimeout(function() {
      if (iframe && iframe.style.opacity === "0" && iframe.parentNode) {
        iframe.style.opacity = "1";
        loadingPlaceholder.style.display = "none";
      }
    }, 300);

    container.appendChild(loadingPlaceholder);
    container.appendChild(iframe);
    
    // Listen for close message from iframe (if needed in future)
    window.addEventListener("message", function(event) {
      // Security: verify origin if needed
      if (event.data && event.data.type === "SERVIOTS_CLOSE_WIDGET") {
        closeIframe();
      }
    });

    document.body.appendChild(container);
    hideLauncher();
  }

  function verifyAndLoad() {
    if (!WIDGET_KEY) {
      return;
    }

    fetch(
      BACKEND +
        "/api/properties/widget/" +
        encodeURIComponent(WIDGET_KEY) +
        "/settings",
      { credentials: "omit" }
    )
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (settingsData) {
        if (settingsData && settingsData.data) {
          if (settingsData.data.position) {
            widgetPosition = settingsData.data.position;
          }

          var color = settingsData.data.launcherButtonColor;
          if (color && typeof color === "string" && color.trim().length > 0) {
            launcherButtonColor = normalizeColorToHex(color);
            if (launcherButton) {
              updateLauncherButtonColor();
            }
          }
        }

        if (!launcherButton) {
          createLauncherButton();
        } else {
          updateLauncherButtonColor();
          updateLauncherLayout();
        }
      })
      .catch(function () {
        createLauncherButton();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", verifyAndLoad);
  } else {
    verifyAndLoad();
  }
})();
`.trim();

  res.send(script);
}

// This lets widget.js use `${BACKEND}/embed` while the UI can live elsewhere.
export function embedRedirectHandler(req: Request, res: Response) {
  const backendBase = getBackendBaseUrl(req);
  const baseEmbed =
    urlsConfig.widgetEmbedUrl || `${backendBase.replace(/\/+$/, "")}/embed`;

  const search = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const target = `${baseEmbed}${search}`;

  res.redirect(target);
}

export async function verifyWidgetHandler(req: Request, res: Response) {
  const widgetKey = req.query.widgetKey as string | undefined;

  if (!widgetKey) {
    return res.status(400).json({ ok: false, error: "widgetKey is required" });
  }

  const property = await prisma.property.findUnique({
    where: { widgetKey }
  });

  if (!property) {
    return res.status(404).json({ ok: false, error: "Property not found" });
  }

  return res.json({ ok: true, property: { id: property.id, name: property.name } });
}
