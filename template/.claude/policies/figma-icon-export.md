---
id: figma-icon-export
title: Figma MCP cannot export icon assets directly
scope: global
trigger: icon generation from Figma designs
enforcement: soft
---

## Rule

Figma MCP screenshots include canvas background and cannot be saved as files. For app icon work, have the user export the icon from Figma as a high-res PNG, then use ImageMagick (`magick`) + `iconutil` to generate all required sizes (`.icns`, `.ico`, multi-res PNGs). The SVG assets from `get_design_context` can be downloaded from `localhost:3845` but compositing them precisely is error-prone — prefer the user's Figma export.

