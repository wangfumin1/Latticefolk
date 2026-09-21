# Dialogue library

Latticefolk treats authored dialogue as data rather than model-generated text.

## Plain text

One line becomes one complete dialogue candidate:

```text
Morning. The fields look good today.
Have you seen the cart near the market?
```

## TSV

```text
line\tgreet,happy\tGood morning!
fragment:opener\tgreet\tHey, 
fragment:body\tsmalltalk\tthe market is busy today
fragment:closer\tgreet\t. Good to see you.
```

## JSONL

See `data/dialogue-example.jsonl` for the full schema.

At runtime, `DialogueStore` indexes metadata locally and retrieves a small candidate set before the decision provider is called. This design allows the corpus to grow without sending the whole library to a remote service on each interaction.
