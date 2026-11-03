# Design direction: making it feel expensive

Tyashin's renderer already handles the engineering laws: fast loading with nothing hidden above the fold, no layout shift, reduced-motion support, accessible markup, self-hosted fonts, schema and sitemaps. Your levers are the spec fields. Use them with taste.

## What luxury actually is

1. **Restraint.** Generous space, one accent used sparingly, three to six sections a page, and one primary action that comes back once at the end. Fewer words per screen.
2. **Hierarchy by size and space, not shouting.** Short headlines carry the page. Sub-copy explains and body copy proves.
3. **Specific beats generic.** "Hand-finished oak joinery for period homes" beats "Quality craftsmanship". Write about this business, never about businesses in general.
4. **Light over decoration.** No gimmicks. The palette and type do the work.
5. **Editing is design.** If a section exists only to fill space, cut it.

## Not looking like everyone else

Decide the **thesis** first: one sentence on how this brand should feel ("Quiet, warm precision — a workshop that smells of cedar"). Then let it choose the following.

- **Palette** (six hex colours):
  - `primary` is buttons and links. `onPrimary` is the text on it, at 4.5:1 or more.
  - `accent` is used sparingly for highlights and hairlines.
  - `background` is the page. `foreground` is body text on it, at 4.5:1 or more.
  - `ink` is the dark ground for the footer, CTA bands and dark sections. White text on it must reach 4.5:1. Make it a colour that belongs to the brand, never `#000000`.
  - Derive the palette from the industry and the owner's mood words. Respect any colour they asked for. Avoid default purple gradients and grey-on-grey neutrality.
- **Type pairing.** Pick for contrast and for the industry, and never just take the first option:
  - Serif display + clean sans body, such as `cormorant-garamond` or `playfair-display` with `figtree` or `manrope`, suits heritage, hospitality, beauty, legal and craft.
  - Geometric or grotesk display + humanist body, such as `space-grotesk`, `sora` or `outfit` with `dm-sans` or `source-sans-3`, suits tech, fitness, modern services and B2B.
  - Expressive display such as `syne` or `fraunces` suits creative studios and food. Use it with discipline.
  - `lora` as the body font gives a literary, editorial voice.
- **Radius.** `sharp` is precise, architectural or industrial. `soft` is a calm professional default. `round` is friendly, family or wellness.
- **Motion.** `static` is clinical or legal. `subtle` suits most businesses. `expressive` suits creative or youth brands, and even then stay legible.
- **Section mix and variants.** Vary hero variants (`split`, `centered`, `editorial`, `stacked`) and feature variants (`grid`, `list`, `alternating`) to match the content. A process reads well as a numbered `list`, a service range as a `grid`, and two or three flagship offers as `alternating`. Don't default to hero + three cards + testimonials.
- **Dark sections.** Use `dark: true` on at most one or two sections per page for rhythm, never on consecutive sections.

Two businesses in the same industry should still differ: a family bakery and a patisserie are both "food", but one is warm and round and the other is sharp and editorial.

## Copy that sells without inventing

- Lead with the outcome for the customer, not the company's history.
- Use the owner's words where they're good, and tighten them where they ramble.
- Proof comes only from real facts: credentials the owner stated, real quotes, real numbers. If there's no proof yet, write the benefit clearly and leave the proof to asset debt.
- Every image is a **brief for the owner's own photo**: what to shoot, how and where. Write it so the owner could hand it to a photographer.

## Accessibility (non-negotiable)

- All contrast pairs at 4.5:1 or more. `tyashin_check_spec` checks the three that matter most.
- Write alt text that describes the purpose of the image, not "image of".
- Link labels say where they go ("See our services", not "Click here").
