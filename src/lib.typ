#import "@preview/mitex:0.2.5": *

#let problem-counter = counter("problem")

#let m(str) = mi(str)
#let dm(str) = mitex("$$" + str + "$$")

#let get-balloon-color(index) = {
  let colors = (
    "Silver",      // A
    "Red",         // B
    "Pink",        // C
    "Green",       // D
    "Purple",      // E
    "Yellow",      // F
    "Black",       // G
    "White",       // H
    "Orange",      // I
    "Lime Green",  // J
    "Blue",        // K
    "Gold",        // L
    "Light Blue",  // M
    "Black",       // N
    "White"        // O
  )
  if index < colors.len() {
    colors.at(index)
  } else {
    "Unknown"
  }
}

#let contest-layout(
  title: "Olympiad in Informatics",
  location: "Somewhere",
  date: "Once upon a time",
  body
) = {
  problem-counter.update(0)

  set text(font: "New Computer Modern", size: 11pt, lang: "en")
  set par(justify: true, leading: 0.65em, first-line-indent: 0pt, spacing: 1em)
  
  set list(indent: 1.5em, marker: ([•], [--]))
  set enum(indent: 1.5em)

  set page(
    paper: "a4",
    margin: (top: 2cm, bottom: 2cm, x: 2cm), 
    
    header: context {
      set text(font: "New Computer Modern", size: 10pt)
      set align(center)
      stack(
        dir: ttb,
        spacing: 0.5em,
        block[#title \ #location, #date],
        line(length: 100%, stroke: 0.5pt)
      )
    },

    footer: context {
      line(length: 100%, stroke: 0.5pt)
      set align(center)
      set text(font: "New Computer Modern", size: 10pt)
      let page-num = counter(page).get().first()
      let total-pages = counter(page).final().first()
      [Page #page-num of #total-pages]
    }
  )

  body
}

#let problem(
  title: "",
  input-file: "standard input",
  output-file: "standard output",
  time-limit: "1 second",      
  memory-limit: "256 megabytes", 
  balloon: auto,
  points: none,
  body
) = {
  pagebreak(weak: true)
  
  problem-counter.step()
  
  context {
    let p-index = problem-counter.get().first() - 1
    let p-letter = problem-counter.display("A")

    set text(font: "New Computer Modern", weight: "bold", size: 16pt)
    
    block(below: 1em)[
      Problem #p-letter. #title
    ]

    let meta-text(content) = text(font: "New Computer Modern", size: 10pt, content)
    let meta-label(content) = text(font: "New Computer Modern", size: 10pt, content)

    let row(label, value) = (
      meta-label(label), 
      meta-text(value)
    )

    let cells = ()
    
    if input-file != none {
      cells += row("Input file:", input-file)
    }
    if output-file != none {
      cells += row("Output file:", output-file)
    }
    if time-limit != none {
      cells += row("Time limit:", time-limit)
    }
    if memory-limit != none {
      cells += row("Memory limit:", memory-limit)
    }

    let display-balloon = if balloon == auto {
      get-balloon-color(p-index)
    } else {
      balloon
    }

    if display-balloon != none {
      cells += row("Balloon Color:", display-balloon)
    }
    
    if points != none {
      cells += row("Points:", str(points))
    }

    pad(bottom: 0.5em)[
      #grid(
        columns: (auto, auto),
        column-gutter: 1.5em, 
        row-gutter: 0.2em,
        ..cells
      )
    ]
  }

  body
}

#let section-header(title) = {
  v(0.5em)
  block(below: 0.5em)[
    #text(font: "New Computer Modern", weight: "bold", size: 12pt, title)
  ]
}

#let input-spec(body) = { section-header("Input") + body }
#let output-spec(body) = { section-header("Output") + body }
#let note(body) = { section-header("Note") + body }
#let scoring(body) = { section-header("Scoring") + body }
#let interaction(body) = { section-header("Interaction") + body }

#let sample(..args) = {
  v(0.5em)
  section-header("Example" + if args.pos().len() > 2 { "s" } else { "" })
  
  let header-cell(content) = block(
    width: 100%, 
    inset: 6pt, 
    stroke: (bottom: 0.5pt + black),
    fill: none,
    align(center, text(font: "New Computer Modern", weight: "bold", size: 10pt, content))
  )

  let content-cell(content) = block(
    width: 100%, 
    inset: 6pt,
    text(font: "DejaVu Sans Mono", size: 10pt, raw(block: true, content)) 
  )

  let cells = (header-cell("standard input"), header-cell("standard output"))
  let data = args.pos()
  
  for i in range(0, data.len(), step: 2) {
    let in-str = data.at(i)
    let out-str = if i + 1 < data.len() { data.at(i + 1) } else { "" }
    
    cells.push(content-cell(in-str))
    cells.push(content-cell(out-str))
  }

  block(breakable: false, width: 100%)[
    #table(
      columns: (1fr, 1fr),
      inset: 0pt,
      stroke: 0.5pt + black,
      align: left,
      ..cells
    )
  ]
}
