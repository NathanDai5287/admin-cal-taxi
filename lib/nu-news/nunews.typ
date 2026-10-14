// Builds Nu News from JSON.
// The server passes `--input content=<json> --input data=<json>`; local builds read the files.
#import "newsletter.typ": newsletter

#let input-json(key, fallback-path) = if key in sys.inputs {
  json(bytes(sys.inputs.at(key)))
} else {
  json(fallback-path)
}

#newsletter(
  content: input-json("content", "content.json"),
  data: input-json("data", "data.json"),
)
