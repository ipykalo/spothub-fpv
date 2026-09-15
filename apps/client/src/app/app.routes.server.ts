import { RenderMode, type ServerRoute } from '@angular/ssr';

/**
 * Only the public pages are rendered on the server: a visitor, a search
 * engine or a link preview gets real HTML for a build or a post.
 *
 * Everything behind sign-in stays rendered in the browser. The server holds no
 * session — the access token lives in the browser's memory — so it could only
 * ever render those pages signed out, and some of them (the map) touch browser
 * APIs the moment they load.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'builds', renderMode: RenderMode.Server },
  { path: 'builds/:id', renderMode: RenderMode.Server },
  { path: 'builds/:id/:slug', renderMode: RenderMode.Server },
  { path: 'blog', renderMode: RenderMode.Server },
  { path: 'blog/:id', renderMode: RenderMode.Server },
  { path: 'blog/:id/:slug', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Client },
];
