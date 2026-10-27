import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import '../style.css'

export const Route = createRootRoute({
  head: () => ({ meta: [
    { charSet: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { title: 'Redact × Federation / Runtime Lab' },
  ] }),
  component: () => <html lang="en"><head><HeadContent /></head><body>
    <Outlet />
    <script dangerouslySetInnerHTML={{ __html: 'window.__SSR_ELEMENT__ = document.querySelector("[data-testid=ssr-probe]")' }} />
    <Scripts />
  </body></html>,
})
