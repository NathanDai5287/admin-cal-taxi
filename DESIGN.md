---
name: "Theta Xi Nu Chapter Public Site"
description: "A documentary public crossroads for chapter recruitment and venue hosting."
colors:
  brand-blue: "#075985"
  brand-blue-dark: "#063a58"
  brand-blue-pale: "#e8f2f9"
  ink: "#101014"
  muted: "#606066"
  rule: "#d8d8db"
  page: "#f5f5f7"
  surface: "#ffffff"
  action-blue-light: "#8bc1df"
  selection-blue: "#b8dcf3"
  ice-blue: "#d8edf8"
typography:
  display:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "clamp(44px, 6vw, 88px)"
    fontWeight: 750
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "clamp(34px, 4.5vw, 64px)"
    fontWeight: 720
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "clamp(22px, 2.5vw, 34px)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "clamp(16px, 1.5vw, 20px)"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Inter, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.16em"
rounded:
  none: "0px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "32px"
  xl: "48px"
  section: "clamp(80px, 10vw, 150px)"
components:
  action-primary:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 30px"
    height: "62px"
  action-primary-hover:
    backgroundColor: "{colors.brand-blue-dark}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 30px"
    height: "62px"
  action-light:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 30px"
    height: "62px"
  brand-mark:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.none}"
    size: "40px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "12px 14px"
    height: "48px"
  form-submit:
    backgroundColor: "{colors.brand-blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 24px"
    height: "52px"
---

# Design System: Theta Xi Nu Chapter Public Site

## Overview

**Creative North Star: "The Public Crossroads"**

This system turns the public site into one clear choice between meeting Nu Chapter and hosting an event. It avoids the usual single-purpose fraternity hero and gives both paths equal visual weight.

The visual world combines brand blue, cool white fields, documentary photography, sharp corners, hairline rules, and compact uppercase Inter labels. Real chapter life provides warmth inside a precise editorial frame.

The recruitment path continues from the crossroads into a dedicated public introduction. It leads with the chapter, then offers confirmed public events.

This system applies only to `/`, `/rush`, `/events`, `/host`, and public components. Private member and administrator surfaces keep their separate operating-interface design.

**Key Characteristics:**

- Equal recruitment and venue paths.
- A dedicated recruitment path that leads to confirmed public events.
- Documentary photographs with factual captions.
- Brand-blue actions on cool white fields.
- Sharp geometry and hairline rules.
- Large Inter headlines and compact uppercase labels.
- Honest empty states for missing public information.
- Factual public forms with clear sending, success, and error states.

## Colors

The palette uses one authoritative blue with cool neutrals and restrained lighter blue states.

### Primary

- **Berkeley Brand Blue:** The identity, main actions, major venue fields, and active navigation use this color.
- **Deep Brand Blue:** Hover states deepen the main action without adding a new accent.
- **Pale Brand Blue:** Venue sections use this quiet field to separate factual content.

### Neutral

- **Editorial Ink:** Headlines, dark sections, and focus boundaries use this near-black neutral.
- **Measured Gray:** Supporting copy and metadata use this color.
- **Hairline Gray:** Dividers define the grid and replace decorative card edges.
- **Cool Page:** Secondary sections and page backgrounds use this cool white-gray.
- **Paper White:** The masthead, divider, and primary content fields use this surface.

### Named Rules

**The One Blue Rule.** Brand blue is the only strong accent across the public system.

**The Factual Contrast Rule.** Use dark fields for public records, not for decorative drama.

## Typography

**Display Font:** Inter (with Arial and sans-serif fallbacks)

**Body Font:** Inter (with Arial and sans-serif fallbacks)

**Character:** Inter keeps English and Greek text consistent. Heavy compact headlines contrast with calm sentence-case body copy.

### Hierarchy

- **Display:** Heavy, tightly tracked type identifies page statements and major section openings.
- **Headline:** Strong compact type introduces public records, events, and venue facts.
- **Title:** Medium-heavy type carries invitations and paired actions.
- **Body:** Regular sentence-case type explains facts within a readable 64-character line.
- **Label:** Heavy uppercase type identifies actions, navigation, facts, and captions.

### Named Rules

**The Greek Consistency Rule.** Use Inter for all Greek letters and Greek text.

**The Label Restraint Rule.** Reserve tracked uppercase type for labels, actions, facts, and navigation.

## Layout

The first desktop viewport uses two equal photographic fields around a narrow vertical ΘΞ divider. Matched actions sit low in each image, and the chapter facts close the frame.

Public sections use broad fluid gutters and hairline grid divisions. Content widths reach 1440px, while record sections use tighter 1220px reading bounds.

The recruitment page uses an equal blue-and-photograph split on desktop. On mobile, its chapter-life photograph leads before the introduction and chapter facts.

At 760px and below, the hero paths stack with equal height and prominence. Two-column records, actions, facts, and footers become one column without changing their order.

**The Equal Paths Rule.** Recruitment and hosting receive equal area, action strength, and placement.

**The Recruitment Path Rule.** Send recruitment actions to the public recruitment page or confirmed public events.

## Elevation & Depth

The system is flat by default and does not use shadows for surface hierarchy. Rules, tonal fields, image overlays, and full-bleed photography create depth.

The focus treatment uses a white outline and an ink ring. It remains visible across photographs, blue fields, white surfaces, and dark sections.

**The Flat Record Rule.** Do not raise public content into floating cards.

## Shapes

All public surfaces, buttons, image frames, marks, and fields use square corners. Thin borders and clipped rectangular images form the main geometry.

The ΘΞ divider and square brand mark are the signature silhouettes. Directional arrows use square line caps to match the same hard geometry.

## Components

### Actions

- **Shape:** Rectangular with square corners and a one-pixel border.
- **Primary:** Brand blue with white uppercase text and a minimum 62px height.
- **On image:** A slightly translucent blue field uses a lighter blue border.
- **Light:** White on brand blue for the main venue inquiry.
- **Hover / Focus:** Hover deepens or lifts the action slightly, while focus adds the shared high-contrast ring.

### Navigation

- **Style:** A white ruled masthead pairs a square ΘΞ mark with compact uppercase links.
- **Routes:** Chapter, Rush, Events, and Host remain visible public choices.
- **Hover:** The text turns brand blue and gains a two-pixel lower rule.
- **Mobile:** The brand sits above a single horizontal navigation row.

### Crossroads Hero

- **Structure:** Two equal full-height documentary photographs flank the vertical ΘΞ divider.
- **Content:** Each path uses one large heading and one matched action near the lower edge.
- **Image treatment:** A dark lower fade protects text without hiding documentary detail.
- **Mobile:** The photographs stack around a horizontal ΘΞ divider.

### Records and Facts

- **Style:** Facts use ruled rows, compact uppercase labels, and right-aligned values.
- **Background:** White, cool page, pale blue, or ink fields separate content groups.
- **Spacing:** Large section padding offsets dense label and rule details.

### Inputs and Fields

- **Style:** White rectangular fields use square corners, ink text, and a one-pixel hairline border.
- **Labels:** Compact uppercase labels sit above each field, while optional text uses a quieter weight.
- **Focus:** Brand blue replaces the border and adds a two-pixel inset lower rule.
- **Layout:** Related fields use two columns on wide screens and one column at 760px and below.
- **Textarea:** Long event details use a vertically resizable field with at least 130px height.

### Venue Inquiry Form

- **Structure:** The form uses a three-pixel blue top rule, grouped fields, and one direct submit action.
- **Fields:** Collect contact, organization, event type, optional date and guest count, and event details.
- **Submitting:** Disable the action, show “Sending…,” reduce its opacity, and keep the status area stable.
- **Success:** Reset the fields and announce receipt in brand blue through the live status area.
- **Error:** Keep the entered values and announce a direct correction or retry message in ink.
- **Mobile:** Stack field pairs and place the status message below the full-width action.
- **Boundary:** Submitted records appear only in the authenticated administrator inbox, which keeps the private admin design system.

**The Inquiry Boundary Rule.** Public visitors can submit venue inquiries, but only administrators can read the stored records.

### Venue Photograph Sequence

- **Structure:** The indoor space uses a four-photograph grid with a walkthrough video, while the backyard shows its confirmed gathering photograph on its own.
- **Rhythm:** The indoor lead image anchors the grid, and every photograph keeps its own frame on narrow screens.
- **Honesty:** Show only confirmed venue photographs. Never describe counts, reserved slots, or other page bookkeeping.

### Empty States

- **Style:** Plain text sits inside a ruled record area with one direct action.
- **Content:** State what is unavailable and give the visitor a useful on-site path.

### Recruitment Introduction

- **Structure:** An equal blue-and-photograph split introduces Nu Chapter with a dedicated chapter-life image.
- **Primary path:** The local action moves visitors to recruitment details, then public events.
- **Secondary path:** Public events provide the next confirmed chance to visit.
- **Mobile:** The photograph appears first, followed by the introduction, facts, and actions.

### Documentary Images

- **Style:** Full-bleed rectangular crops use factual uppercase captions.
- **Content:** Show real chapter life and use specific alternative text.
- **Lightbox:** Selecting any photograph opens the full, uncropped image in a dimmed overlay; Escape or the close action returns to the page.
- **Reuse:** Each supplied photograph appears in one public location only.
- **Constraint:** Never use chapter-life photography as proof of the venue.
- **Range:** Supplied documentary photographs can show alcohol.

## Do's and Don'ts

### Do:

- **Do** give recruitment and venue hosting equal visual weight.
- **Do** send primary recruitment actions to the public recruitment page.
- **Do** route recruitment interest to confirmed public events.
- **Do** use real chapter photographs before broad claims.
- **Do** use hairline rules and tonal fields to organize content.
- **Do** keep public claims traceable and show honest empty states.
- **Do** preserve visible focus and reduced-motion behavior.
- **Do** show pending, success, validation, rate-limit, and retry states near the public form action.
- **Do** keep stored venue inquiries inside the administrator-only inbox.
- **Do** keep this design system inside the public surface boundary.

### Don't:

- **Don't** add rounded card grids, gradients, glass effects, or floating panels.
- **Don't** use Old English type or generic fraternity crest styling.
- **Don't** invent event dates, testimonials, prices, or venue evidence.
- **Don't** expose stored venue inquiries on a public or member route.
- **Don't** apply public form styling to the private administrator inbox.
- **Don't** apply this public marketing system to private member or administrator workflows.
