# kai-chattr devdocs

Fumadocs static-export docs site for kai-chattr (a clean rebuild of chattr).

The `content/contracts/*.mdx` files are **generated** by
`governance/scripts/build-contract-docs.mjs` — do not edit them by hand.

## Local dev

```sh
pnpm install
pnpm run dev    # http://localhost:8870
```

## Static build

```sh
pnpm run build  # writes ./out
```
