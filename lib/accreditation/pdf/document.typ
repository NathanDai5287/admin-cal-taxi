#let doc = json(bytes(sys.inputs.document))
#set page(paper: "us-letter", margin: 0.75in, numbering: "1")
#set text(font: "DejaVu Sans", size: 10pt, fill: rgb("202b3b"))
#set par(leading: 0.65em)
#set heading(numbering: none)
#text(size: 10pt, weight: "bold")[Theta Xi · Nu Chapter]
#v(10pt)
#text(size: 21pt, weight: "bold", doc.title)
#if doc.period != "" { par(doc.period) }
#v(12pt)
#for block in doc.blocks {
  if block.type == "heading" {
    heading(level: block.level, block.text)
  } else if block.type == "paragraph" {
    par(block.text)
    v(5pt)
  } else if block.type == "list" {
    if block.ordered { enum(..block.items) } else { list(..block.items) }
  } else if block.type == "table" {
    table(columns: (1fr,) * block.headers.len(), inset: 5pt, stroke: 0.4pt + rgb("bac0c8"),
      table.header(..block.headers.map(value => text(weight: "bold", value))),
      ..block.rows.flatten())
    v(8pt)
  } else if block.type == "signature" {
    v(24pt)
    line(length: 65%)
    par(block.label)
  } else if block.type == "page_break" {
    pagebreak(weak: true)
  }
}
