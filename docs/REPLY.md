# Reply draft

## Short reply

Tried it: TanStack Start + 3 MF remotes, deployed on Zephyr. Redact 0.2.1 passed hooks, shared context, callbacks and portals. Explicit runtime sharing also passes identity checks. Client-loaded remotes; federated SSR untested.

https://github.com/tonoizer/tanstack-redact-federation-lab

## Follow-up with the interesting detail

One interesting detail: default Redact aliases passed the interaction tests too, but the remotes exported different hook functions. Redact 0.2.1 shares its dispatcher via a global symbol, so working hooks alone don’t prove deduplication.

For explicit sharing, I let Federation own the React/JSX/DOM import names in the remotes and supplied the host’s Redact-backed modules as singleton shares. Hooks, the shared context object, and createPortal then matched the host by reference.

The repo includes the exact configs, three build variants, Playwright tests, evidence, limitations, and the live Zephyr demo link. The host is server rendered; the remotes load in the browser. I haven’t tested federated SSR or mixed versions.
