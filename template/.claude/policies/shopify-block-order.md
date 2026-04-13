---
id: shopify-block-order
title: Shopify JSON templates use block_order (singular), not blocks_order
scope: global
trigger: shopify json template, section blocks, blocks_order
enforcement: hard
---

## Rule

In Shopify JSON templates, the key for ordering blocks is **`block_order`** (singular), NOT `blocks_order`.

Using `blocks_order` is silently ignored — Shopify won't error, but `section.blocks.size` will be 0 and all blocks will render as empty. Section-level settings still load correctly, making this a subtle and hard-to-debug issue.

Correct format:
```json
{
  "sections": {
    "my-section": {
      "type": "my-section",
      "settings": { ... },
      "blocks": { "block-1": { "type": "...", "settings": { ... } } },
      "block_order": ["block-1"]
    }
  },
  "order": ["my-section"]
}
```
