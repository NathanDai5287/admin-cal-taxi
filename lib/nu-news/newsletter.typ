// Nu News template: layout and style only.
// Text comes from content.json. Images and links come from data.json.
// Entry point: newsletter(content: ..., data: ...).
//
// Page order: cover, articles, the How to Donate page, then the Photo Gallery on a new page.
// One planning pass (issue-pages) knows every height in advance: the template measures each
// paragraph, simulates Typst's column breaks, balances each article's last columns, and fills
// the space at the bottom of each article page with photos (see fill-space). The donate page
// shows the panel and one photo: the gallery entry with "donate": true, else the first
// "feature" entry, else the first entry. The Photo Gallery shows the photos that are left.

#let colors = (
  paper: rgb("#FBF7EE"),
  ink: rgb("#1F1E1C"),
  charcoal: rgb("#3D3B37"),
  muted: rgb("#6B665E"),
  hairline: rgb("#DCD4C5"),
  blue: rgb("#0B5784"),
  navy: rgb("#063A58"),
  sky: rgb("#8BC1DF"),
  sky-wash: rgb("#E7F0F5"),
)

#let serif = "Source Serif 4 SmText"
#let sans = "Barlow"

#let margin = (top: 0.6in, bottom: 0.85in, x: 0.75in)
#let text-width = 8.5in - 2 * margin.x
#let gutter = 0.2in
#let grid-column = (text-width - 11 * gutter) / 12
#let span(columns) = columns * grid-column + (columns - 1) * gutter
#let text-column = span(6)

#let body-size = 10pt
#let line-pitch = 14pt
#let leading = line-pitch - body-size
#let paragraph-indent = 1em
#let hyphenation-cost = 300%
#let closing-gap-lines = 1

#let header-gap = 16pt
#let article-gap = 0.42in
#let headshot-height = 1.0in
#let title-size = 34pt
#let title-leading = 0.2em
#let byline-gap = 10pt
#let article-min-lines = 8
#let article-min-page-share = 0.4

#let photo-gap = gutter
#let fill-gap = 0.3in
#let row-height-min = 1.4in
#let row-height-nominal = 2.4in
#let row-targets = range(14, 62, step: 2).map(tenths => tenths * 0.1in)
#let photos-per-row-max = 3
#let crop-max = 0.2
#let scale-min = 1 - crop-max
#let scale-max = 1 / (1 - crop-max)
#let crop-weight = 4
#let fill-lookahead = 6
#let photos-per-page-max = 15
#let gallery-page-cost = 1.0

#let link-pattern = regex("([\w.+-]+@)?[\w-]+(\.[\w-]+)*\.(org|com|net|edu|taxi)\b")
#let link-target(address) = if address.contains("@") { "mailto:" + address } else { "https://" + address }

// ---------- type roles ----------

#let label-text(body, fill: colors.muted, size: 7.5pt) = text(
  font: sans, size: size, weight: 600, tracking: 0.09em, fill: fill, upper(body),
)

#let headline(size, body, fill: colors.charcoal) = text(
  font: sans, stretch: 75%, weight: 700, size: size, fill: fill, body,
)

// Flush left and ragged right: word spaces never stretch. Optimized line breaks keep the
// right edge even, and the high hyphenation cost allows a hyphen only where it removes a deep hole.
#let body-style(body) = {
  set text(
    font: serif, size: body-size, fill: colors.ink, costs: (hyphenation: hyphenation-cost),
    top-edge: 0.75 * body-size, bottom-edge: -0.25 * body-size,
  )
  set par(linebreaks: "optimized", leading: leading, spacing: leading, first-line-indent: 0pt)
  body
}

// ---------- photos ----------

#let asset(path) = "/" + path

#let photo(src, width, height, aspect: none, focus: (0.5, 0.5)) = {
  let crop(aspect) = {
    let (shown-width, shown-height) = if width / height > aspect {
      (width, width / aspect)
    } else {
      (height * aspect, height)
    }
    let dx = calc.min(0pt, calc.max(width - shown-width, width / 2 - focus.at(0) * shown-width))
    let dy = calc.min(0pt, calc.max(height - shown-height, height / 2 - focus.at(1) * shown-height))
    [#metadata((src: src, width: width / 1pt, height: height / 1pt, aspect: aspect))<nunews-photo>]
    box(width: width, height: height, clip: true, place(
      top + left, dx: dx, dy: dy,
      image(src, width: shown-width, height: shown-height),
    ))
  }
  if aspect != none { crop(aspect) } else {
    context {
      let size = measure(image(src))
      crop(size.width / size.height)
    }
  }
}

// Call inside context. The id tells apart two gallery entries with the same file.
#let gallery-photo(item, id) = {
  let src = asset(item.src)
  let size = measure(image(src))
  (
    id: id,
    src: src,
    aspect: size.width / size.height,
    feature: item.at("feature", default: false),
    donate: item.at("donate", default: false),
    focus: item.at("focus", default: (0.5, 0.5)),
  )
}

#let natural-row-height(row, width) = (width - (row.len() - 1) * photo-gap) / row.map(p => p.aspect).sum()

#let row-cost(height, target) = calc.pow(calc.ln(height / target), 2)

// Justified rows (as in Flickr or Google Photos): every row spans the full width, and the
// split keeps row heights near the target (dynamic programming over the ordered photos).
#let justified-rows(photos, width, target) = {
  let count = photos.len()
  let best-cost = (0.0,) + (float.inf,) * count
  let row-start = (0,) * (count + 1)
  for end in range(1, count + 1) {
    for size in range(1, calc.min(photos-per-row-max, end) + 1) {
      let start = end - size
      let row = photos.slice(start, end)
      if size > 1 and row.any(p => p.feature) { continue }
      let cost = best-cost.at(start) + row-cost(natural-row-height(row, width), target)
      if cost < best-cost.at(end) {
        best-cost.at(end) = cost
        row-start.at(end) = start
      }
    }
  }
  let rows = ()
  let end = count
  while end > 0 {
    rows.insert(0, photos.slice(row-start.at(end), end))
    end = row-start.at(end)
  }
  rows
}

#let stack-height(heights, scale) = heights.sum() * scale + (heights.len() - 1) * photo-gap
#let fill-scale(heights, space) = (space - (heights.len() - 1) * photo-gap) / heights.sum()

// The rows keep their natural widths; the scale sets their height, so a photo loses
// 1 - scale of its height (scale < 1) or 1 - 1 / scale of its width (scale > 1).
#let layout-cost(heights, scale) = (
  heights.map(h => row-cost(h * scale, row-height-nominal)).sum() + crop-weight * calc.pow(calc.ln(scale), 2)
)

// Sets all the photos, in order, as rows that fill the box exactly. Returns none when no
// row split obeys the crop and row-height limits.
#let exact-layout(photos, width, height) = {
  let best = none
  for target in row-targets {
    let rows = justified-rows(photos, width, target)
    let heights = rows.map(row => natural-row-height(row, width))
    let scale = fill-scale(heights, height)
    if scale < scale-min or scale > scale-max { continue }
    if calc.min(..heights) * scale < row-height-min { continue }
    let cost = layout-cost(heights, scale)
    if best == none or cost < best.cost {
      best = (cost: cost, rows: rows, scale: scale)
    }
  }
  best
}

// Gallery fallback for a last page that too few photos cannot fill: the rows take their
// largest allowed size from the top of the page.
#let loose-layout(photos, width, height) = {
  let best = none
  for target in row-targets {
    let rows = justified-rows(photos, width, target)
    let heights = rows.map(row => natural-row-height(row, width))
    let scale = calc.min(fill-scale(heights, height), scale-max)
    if scale < scale-min { continue }
    let empty = (height - stack-height(heights, scale)) / height
    let cost = 100 + 40 * empty + layout-cost(heights, scale)
    if best == none or cost < best.cost {
      best = (cost: cost, rows: rows, scale: scale)
    }
  }
  best
}

#let photo-row(row, width, height) = {
  let natural = natural-row-height(row, width)
  stack(dir: ltr, spacing: photo-gap, ..row.map(p => photo(
    p.src, p.aspect * natural, height, aspect: p.aspect, focus: p.focus,
  )))
}

#let photo-rows(rows, width, scale) = stack(spacing: photo-gap, ..rows.map(row => photo-row(
  row, width, natural-row-height(row, width) * scale,
)))

// Fill rules. A fill closes the space at the bottom of a page with photos from the queue.
// - Use the photos in queue order. Use each photo one time only.
// - Do not use feature photos. They stay in the queue for the gallery.
// - Put 1 to 3 photos in a row. Each row spans the box, with the layout gutter between photos.
// - Scale all rows by one factor, so that the rows fill the box height exactly.
// - Crop 20% or less from each photo, around its focus point.
// - Make each row 1.4 in high or more.
// - Skip a photo only when no layout without the skip obeys these rules. A skipped photo
//   stays first in the queue. Look at the first 6 photos only.
// - Of the layouts with the fewest skips, use the one with rows nearest to 2.4 in high and
//   the least crop. If no layout obeys the rules (for example, the queue is empty), return none.
#let fill-space(queue, width, height) = {
  let candidates = queue.filter(p => not p.feature)
  candidates = candidates.slice(0, calc.min(candidates.len(), fill-lookahead))
  let best = none
  for mask in range(1, calc.pow(2, candidates.len())) {
    let chosen = range(candidates.len()).filter(i => calc.rem(calc.quo(mask, calc.pow(2, i)), 2) == 1)
    let photos = chosen.map(i => candidates.at(i))
    let skips = chosen.last() + 1 - chosen.len()
    if best != none and skips > best.skips { continue }
    let layout = exact-layout(photos, width, height)
    if layout == none { continue }
    if best == none or skips < best.skips or layout.cost < best.cost {
      best = (skips: skips, photos: photos, ..layout)
    }
  }
  best
}

#let without(queue, used) = {
  let ids = used.map(p => p.id)
  queue.filter(p => p.id not in ids)
}

// Splits the ordered photos into pages (dynamic programming over the page breaks). Every page
// is filled exactly; only when that is not possible, the last page uses loose-layout.
// The first page shares its space with the section header.
#let plan-gallery(photos, width, first-space, page-space) = {
  let count = photos.len()
  let plans = ((cost: 0.0, pages: ()),) + (none,) * count
  for end in range(1, count + 1) {
    for start in range(calc.max(0, end - photos-per-page-max), end) {
      let before = plans.at(start)
      if before == none { continue }
      let space = if start == 0 { first-space } else { page-space }
      let layout = exact-layout(photos.slice(start, end), width, space)
      if layout == none and end == count { layout = loose-layout(photos.slice(start, end), width, space) }
      if layout == none { continue }
      let cost = before.cost + layout.cost + gallery-page-cost
      if plans.at(end) == none or cost < plans.at(end).cost {
        plans.at(end) = (cost: cost, pages: before.pages + (layout,))
      }
    }
  }
  plans.at(count).pages
}

// ---------- article text ----------

#let body-paragraph(text, indented) = par(
  first-line-indent: (amount: if indented { paragraph-indent } else { 0pt }, all: true),
  text,
)

#let closing-block(lines) = {
  let last = lines.len() - 1
  let styled = lines.enumerate().map(((index, line)) => {
    if index == 0 { emph(line) } else if index == last and last >= 2 {
      text(font: sans, size: 8.5pt, weight: 500, fill: colors.muted, line)
    } else { text(weight: 600, line) }
  })
  block(breakable: false, styled.join(linebreak()))
}

#let article-body(article) = body-style({
  for (index, paragraph) in article.paragraphs.enumerate() {
    body-paragraph(paragraph, index > 0)
  }
  v(closing-gap-lines * line-pitch + leading, weak: true)
  closing-block(article.closing)
})

#let line-count(height) = int(calc.round((height + leading) / line-pitch))
#let lines-in(space) = int(calc.floor((space + leading) / line-pitch + 0.001))
#let lines-height(lines) = lines * line-pitch - leading

// Call inside context. Units are paragraphs plus the closing block, counted in lines.
#let article-units(article) = {
  let lines(body) = line-count(measure(block(width: text-column, body-style(body))).height)
  let paragraphs = article.paragraphs.enumerate().map(((index, paragraph)) => (
    lines: lines(body-paragraph(paragraph, index > 0)), splittable: true, gap: 0,
  ))
  let closing = (lines: lines(closing-block(article.closing)), splittable: false, gap: closing-gap-lines)
  paragraphs + (closing,)
}

// Mirrors Typst's widow and orphan rule: a paragraph breaks only where at least two of its
// lines stay on each side of the break. Returns the position after the column and the lines used.
#let fill-column(units, position, capacity) = {
  let (unit, line) = (position.unit, position.line)
  let used = 0
  while unit < units.len() {
    let current = units.at(unit)
    let gap = if used > 0 and line == 0 { current.gap } else { 0 }
    let remaining = current.lines - line
    if used + gap + remaining <= capacity {
      used += gap + remaining
      unit += 1
      line = 0
      continue
    }
    if current.splittable {
      let taken = calc.min(capacity - used - gap, remaining - 2)
      if line == 0 and taken < 2 { taken = 0 }
      line += calc.max(taken, 0)
      used += calc.max(taken, 0)
    }
    break
  }
  (unit: unit, line: line, used: used)
}

#let balanced-lines(units, position, capacity) = {
  for lines in range(1, capacity + 1) {
    let end = fill-column(units, fill-column(units, position, lines), lines)
    if end.unit == units.len() { return lines }
  }
  none
}

// Returns how many column regions (pages) the article needs, where its last region starts,
// and the balanced line count of that region.
#let plan-columns(units, first-capacity, page-capacity) = {
  let position = (unit: 0, line: 0)
  let regions = 0
  while true {
    let capacity = if regions == 0 { first-capacity } else { page-capacity }
    let lines = balanced-lines(units, position, capacity)
    if lines != none { return (regions: regions + 1, last-start: position, last-lines: lines) }
    position = fill-column(units, fill-column(units, position, capacity), capacity)
    regions += 1
  }
}

// Column ending, when no full-width fill fits: the text fills the first column to the page
// bottom, and a fill goes under the text in the second column when one fits (else fill: none).
// Returns none when the second column keeps fewer than article-min-lines lines.
#let column-ending(units, start, height, queue) = {
  let capacity = lines-in(height)
  let first = fill-column(units, start, capacity)
  let second = fill-column(units, first, capacity)
  if second.used < article-min-lines { return none }
  let space = height - lines-height(second.used) - fill-gap
  (fill: if space >= row-height-min { fill-space(queue, text-column, space) })
}

// ---------- page furniture ----------

#let page-bottom() = page.height - margin.bottom
#let page-space() = page-bottom() - margin.top

#let page-footer(issue) = context {
  let number = counter(page).get().first()
  line(length: 100%, stroke: 0.6pt + colors.charcoal)
  v(6pt)
  grid(
    columns: (1fr, auto),
    align: horizon,
    [#headline(10pt)[Nu News] #text(fill: colors.muted)[·] #label-text(issue.season)],
    headline(10pt, str(number)),
  )
}

#let section-rule = line(length: 100%, stroke: 2pt + colors.charcoal)

#let byline(article) = text(font: sans, size: 10.5pt)[
  #text(weight: 600, fill: colors.charcoal, article.author)
  #h(5pt) #box(width: 10pt, height: 1.5pt, baseline: -3.2pt, fill: colors.sky) #h(5pt)
  #text(weight: 500, fill: colors.muted, article.roster)
]

#let article-label(slug) = label("nunews-article-" + slug)

#let article-header(article, headshot) = block(width: 100%, breakable: false, {
  [#metadata(article.slug)#article-label(article.slug)]
  section-rule
  v(12pt)
  grid(
    columns: (span(2), 1fr),
    column-gutter: gutter,
    photo(asset(headshot.src), span(2), headshot-height, focus: headshot.at("focus", default: (0.5, 0.4))),
    {
      set par(leading: title-leading)
      headline(title-size, article.title)
      v(byline-gap)
      byline(article)
    },
  )
})

#let section-header(title, tag) = block(width: 100%, breakable: false, {
  [#metadata(title)#tag]
  section-rule
  v(12pt)
  headline(title-size, title)
})

#let donate-panel(donate, zelle) = {
  let qr-size = 1.75in
  let qr-padding = 0.13in
  let card-width = qr-size + 2 * qr-padding
  let arrow = box(polygon(fill: white, (0pt, 0pt), (5.5pt, 3.85pt), (0pt, 7.7pt)))
  let card = link(zelle.url, stack(
    box(fill: white, inset: qr-padding, image(asset(zelle.qr), width: qr-size)),
    block(width: card-width, fill: colors.navy, inset: (y: 9pt), align(center, text(
      font: sans, stretch: 75%, size: 11pt, weight: 600, tracking: 0.06em, fill: white,
    )[DONATE WITH ZELLE #h(5pt) #arrow])),
  ))
  let item(body) = grid(
    columns: (16pt, 1fr),
    box(width: 7pt, height: 7pt, fill: colors.blue),
    body,
  )
  let items = {
    show link: strong
    set text(size: 12pt, hyphenate: false)
    set par(leading: 0.6em)
    stack(spacing: 14pt, ..donate.items.map(item))
  }
  block(width: 100%, fill: colors.sky-wash, inset: 0.32in, breakable: false, grid(
    columns: (1fr, card-width),
    column-gutter: span(1),
    {
      headline(title-size, donate.heading)
      v(20pt)
      items
    },
    {
      card
      v(8pt)
      align(center, text(font: sans, size: 9pt, weight: 500, fill: colors.navy)[Scan or tap to open Zelle])
    },
  ))
}

// ---------- page planning ----------

// Call inside context. The photo takes all the page space that the panel leaves.
#let donate-page(panel, photo-item) = {
  [#metadata("donate")<nunews-donate>]
  if photo-item != none {
    let photo-height = page-space() - measure(block(width: text-width, panel)).height - fill-gap
    photo(photo-item.src, text-width, photo-height, aspect: photo-item.aspect, focus: photo-item.focus)
    v(fill-gap)
  }
  panel
}

// An article starts on the page where the previous one ends when it has room for its header,
// eight lines, and 40% of the page. Otherwise the page ends after the article:
// - When the space under its balanced columns is 1.7 in or more and a fill fits, a full-width
//   fill closes the space.
// - Else the article gets a column ending (see column-ending), with or without a photo.
// - The columns stay balanced, with empty space under them, only when column 2 would keep
//   fewer than 8 lines and no full-width fill fits (for example, when the queue is empty).
#let issue-pages(articles, headshots, gallery, donate-panel) = context {
  let top = margin.top
  let bottom-y = page-bottom()
  let full = page-space()
  let photos = gallery.enumerate().map(((id, item)) => gallery-photo(item, id))
  let donate-photo = photos.find(p => p.donate)
  if donate-photo == none { donate-photo = photos.find(p => p.feature) }
  if donate-photo == none { donate-photo = photos.at(0, default: none) }
  let queue = if donate-photo == none { photos } else { without(photos, (donate-photo,)) }
  let headers = articles.map(article => article-header(article, headshots.at(article.slug)))
  let header-heights = headers.map(header => measure(block(width: text-width, header)).height)
  let need = header-heights.map(height => calc.max(
    article-gap + height + header-gap + article-min-lines * line-pitch,
    article-min-page-share * full,
  ))
  let parts = ()
  let y = top

  for (index, article) in articles.enumerate() {
    if y > top {
      parts.push(v(article-gap))
      y += article-gap
    }
    parts += (headers.at(index), v(header-gap))
    y += header-heights.at(index) + header-gap

    let units = article-units(article)
    let first-space = bottom-y - y
    let plan = plan-columns(units, lines-in(first-space), lines-in(full))
    let region-top = if plan.regions == 1 { y } else { top }
    let earlier-height = if plan.regions == 1 { 0pt } else { first-space + (plan.regions - 2) * full }
    let last-height = lines-height(plan.last-lines)
    let space = bottom-y - region-top - last-height
    let joins = index + 1 < articles.len() and space >= need.at(index + 1)

    let body = article-body(article)
    let after = ()
    if not joins {
      let fill = if space >= fill-gap + row-height-min { fill-space(queue, text-width, space - fill-gap) }
      if fill != none {
        after = (v(fill-gap), photo-rows(fill.rows, text-width, fill.scale))
      } else {
        let ending = column-ending(units, plan.last-start, bottom-y - region-top, queue)
        if ending != none {
          last-height = bottom-y - region-top
          fill = ending.fill
        }
        if fill != none { body += place(bottom + left, photo-rows(fill.rows, text-column, fill.scale)) }
      }
      if fill != none { queue = without(queue, fill.photos) }
    }
    parts.push(block(height: earlier-height + last-height, breakable: true, columns(2, gutter: gutter, body)))
    parts += after
    if joins {
      y = region-top + last-height
    } else {
      parts.push(pagebreak())
      y = top
    }
  }
  parts.push(donate-page(donate-panel, donate-photo))

  if queue.len() > 0 {
    let header = section-header("Photo Gallery", <nunews-gallery>)
    let first-space = full - measure(block(width: text-width, header)).height - header-gap
    parts += (pagebreak(), header, v(header-gap))
    for (index, page) in plan-gallery(queue, text-width, first-space, full).enumerate() {
      if index > 0 { parts.push(pagebreak()) }
      parts.push(photo-rows(page.rows, text-width, page.scale))
    }
  }
  parts.join()
}

// ---------- cover ----------

#let nameplate(size) = text(
  font: sans, stretch: 75%, weight: 800, size: size, fill: colors.charcoal,
  top-edge: "cap-height", bottom-edge: "baseline",
)[Nu News]

#let masthead(issue, logo) = context {
  let probe = measure(nameplate(100pt))
  let cap-ratio = probe.height / 100pt
  let width-ratio = probe.width / 100pt
  let logo-size = cap-ratio / width-ratio * (text-width - gutter) / (1 + cap-ratio / width-ratio)
  let size = (text-width - gutter - logo-size) / width-ratio

  grid(
    columns: (1fr, auto),
    label-text(issue.chapter), label-text(issue.location),
  )
  v(6pt)
  line(length: 100%, stroke: 0.6pt + colors.charcoal)
  v(16pt)
  grid(
    columns: (logo-size, 1fr),
    column-gutter: gutter,
    align: bottom,
    image(asset(logo), width: logo-size, height: logo-size, fit: "contain"),
    nameplate(size),
  )
  v(14pt)
  line(length: 100%, stroke: 2pt + colors.charcoal)
  v(8pt)
  grid(
    columns: (1fr, auto),
    align: horizon,
    headline(16pt, issue.season, fill: colors.blue),
    label-text(issue.date),
  )
}

#let toc-row(number, title, author) = grid(
  columns: (0.4in, 1fr),
  text(font: sans, stretch: 75%, weight: 700, size: 20pt, fill: colors.blue)[#number],
  {
    set par(leading: 0.35em)
    text(size: 10.5pt, weight: 600, fill: colors.ink, title)
    if author != none {
      linebreak()
      text(font: sans, size: 8.5pt, weight: 500, fill: colors.muted, author)
    }
  },
)

#let contents(articles) = {
  let rows = articles.map(a => (article-label(a.slug), a.title, a.author))
  rows += ((<nunews-donate>, [How to Donate], none), (<nunews-gallery>, [Photo Gallery], none))
  let found = rows.filter(((target, ..rest)) => query(target).len() > 0)
  stack(spacing: 9pt, ..found.map(((target, title, author)) => {
    let location = query(target).first().location()
    link(location, toc-row(str(counter(page).at(location).first()), title, author))
  }))
}

// Same paragraph rhythm as the articles: an indent marks each new paragraph, with no extra space.
#let introduction(intro) = {
  set text(size: 11.5pt, hyphenate: false)
  set par(linebreaks: "optimized", leading: 0.6em, spacing: 0.6em, first-line-indent: paragraph-indent)
  for paragraph in intro.paragraphs { par(paragraph) }
}

#let cover-margin = (top: margin.top, bottom: margin.top, x: margin.x)

// The headings share a baseline and the rules under them share a line, so the introduction
// and the contents start together.
#let cover(issue, intro, articles, data) = page(margin: cover-margin, footer: none, grid(
  rows: (auto, 1fr, auto),
  row-gutter: 0.24in,
  masthead(issue, data.logo),
  layout(size => photo(
    asset(data.cover.src), size.width, size.height,
    focus: data.cover.at("focus", default: (0.5, 0.5)),
  )),
  grid(
    columns: (span(7), span(5)),
    column-gutter: gutter,
    row-gutter: (8pt, 12pt),
    align: (x, y) => if y == 0 { bottom } else { top },
    headline(30pt, intro.heading), headline(18pt)[In This Issue],
    line(length: 100%, stroke: 0.6pt + colors.hairline), line(length: 100%, stroke: 0.6pt + colors.hairline),
    introduction(intro), context contents(articles),
  ),
))

// ---------- document ----------

// A preview mark on every page: a faint diagonal word over the content.
#let draft-mark = place(center + horizon, rotate(-40deg, text(
  font: sans, stretch: 75%, weight: 800, size: 170pt, tracking: 0.04em,
  fill: colors.muted.transparentize(80%), stroke: 1.5pt + colors.paper.transparentize(45%),
)[DRAFT]))

#let newsletter(content: none, data: none, draft: false) = {
  let issue = content.issue
  set document(title: "Nu News · " + issue.season, author: issue.chapter, date: none)
  set page(
    paper: "us-letter",
    fill: colors.paper,
    margin: (top: margin.top, bottom: margin.bottom, x: margin.x),
    footer: page-footer(issue),
    footer-descent: 0.3in,
  )
  set page(foreground: draft-mark) if draft
  set block(spacing: 0pt)
  set par(spacing: 0pt)
  set text(font: serif, size: body-size, fill: colors.ink, lang: "en", hyphenate: true)
  show link-pattern: it => link(link-target(it.text), text(hyphenate: false, it.text))
  show link: set text(fill: colors.blue)

  let zelle = (qr: data.zelle.qr, url: read(asset(data.zelle.payload)).trim())
  cover(issue, content.intro, content.articles, data)
  issue-pages(content.articles, data.headshots, data.gallery, donate-panel(content.donate, zelle))
}
