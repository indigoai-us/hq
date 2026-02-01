# Design Styles

Curated style references for frontend-designer and motion-designer workers.

## Available Styles

| Style | Designer | Best For |
|-------|----------|----------|
| [American Industrial](american-industrial.md) | Kyle Anthony Miller | AI/ML, defense, aerospace, industrial, enterprise |

## Usage

### Via Slash Command
```
/style-american-industrial
```
Loads style context into current session.

### Via Worker Knowledge
Workers can reference styles directly:
```
knowledge/design-styles/american-industrial.md
knowledge/design-styles/swipes/american-industrial/
```

## Adding New Styles

1. Create `{style-name}.md` with:
   - Designer attribution
   - Color palette
   - Typography specs
   - Layout patterns
   - Signature elements
   - When to use

2. Add swipes folder: `swipes/{style-name}/`
   - Reference images
   - README with descriptions

3. Create slash command: `.claude/commands/style-{style-name}.md`

4. Update this index
