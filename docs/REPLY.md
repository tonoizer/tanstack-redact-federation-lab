# Reply draft

## Short reply

Tried it: TanStack Start + 3 MF remotes, deployed on Zephyr. Redact 0.2.1 passed hooks, shared context, callbacks and portals. Explicit runtime sharing also passes identity checks. Client-loaded remotes; federated SSR untested.

https://github.com/tonoizer/tanstack-redact-federation-lab

## Follow-up with the interesting detail

One interesting detail: default Redact aliases passed the interaction tests too, but the remotes exported different hook functions. Redact 0.2.1 shares its dispatcher via a global symbol, so working hooks alone don’t prove deduplication.

For explicit sharing, I let Federation own the React/JSX/DOM import names in the remotes and supplied the host’s Redact-backed modules as singleton shares. Hooks, the shared context object, and createPortal then matched the host by reference.

The repo includes the exact configs, four build variants, Playwright tests, evidence, limitations, and the live Zephyr demo link. The host is server rendered; the remotes load in the browser. I haven’t tested federated SSR or mixed versions.

## Follow-up after the optimization

Took the repro further: sharing Redact APIs + the MF core cut requested JS/CSS from 233 kB to 134 kB gzip (~43% vs React) in a local benchmark. Hooks, context & portals still pass. Deployed on Zephyr, with 72 samples and the method in the repo.

Use the current live link from the README and the benchmark report:

https://github.com/tonoizer/tanstack-redact-federation-lab/blob/main/docs/BENCHMARKS.md
