import { type Route } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';
import {
  postConversationResolver,
  postResolver,
  publishedPostsResolver,
} from './features/posts/posts.resolvers';

/**
 * Every route is lazily loaded, so the login screen does not ship the hangar
 * and the initial bundle stays small.
 *
 * The blog is the whole public face of the site: the feed is the home page and
 * a post opens under `/blog`. Both are rendered on the server
 * (`app.routes.server.ts`) with everything they show resolved before they
 * render, so the browser picks up the server's page rather than drawing its
 * own. Everything else — the hangar, parts, flights, spots — is behind sign-in.
 */
export const appRoutes: Route[] = [
  {
    // The home page, for anyone: the blog.
    path: '',
    pathMatch: 'full',
    resolve: { posts: publishedPostsResolver },
    loadComponent: () =>
      import('./features/posts/containers/blog.page').then((m) => m.BlogPage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/containers/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/containers/auth-callback.page').then(
        (m) => m.AuthCallbackPage,
      ),
  },
  // Builds moved behind sign-in, into the hangar, and /builds follows them
  // there. Only the bare path: the server resolves these redirects itself and
  // neither substitutes a parameter (`hangar/:id` went out as the literal
  // /builds/hangar/:id) nor carries the rest of the address over, so a
  // /builds/<id> link lands on the blog through the wildcard below. Nothing
  // was ever deployed under those addresses, so nothing is owed them.
  { path: 'builds', redirectTo: '/hangar' },
  {
    // Public: the posts. The feed itself lives at the home page, and /blog
    // redirects there so the list has one address for a search engine.
    path: 'blog',
    children: [
      { path: '', pathMatch: 'full', redirectTo: '/' },
      {
        path: ':id',
        resolve: { post: postResolver, conversation: postConversationResolver },
        loadComponent: () =>
          import('./features/posts/containers/post.page').then((m) => m.PostPage),
      },
      {
        path: ':id/:slug',
        resolve: { post: postResolver, conversation: postConversationResolver },
        loadComponent: () =>
          import('./features/posts/containers/post.page').then((m) => m.PostPage),
      },
    ],
  },
  {
    // Writing: the viewer's own posts, drafts included.
    path: 'posts',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/posts/containers/my-posts.page').then((m) => m.MyPostsPage),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/posts/containers/post-form.page').then(
            (m) => m.PostFormPage,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/posts/containers/post-form.page').then(
            (m) => m.PostFormPage,
          ),
      },
    ],
  },
  {
    path: 'hangar',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/builds/containers/builds-list.page').then(
            (m) => m.BuildsListPage,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/builds/containers/build-form.page').then(
            (m) => m.BuildFormPage,
          ),
      },
      {
        // The build page proper: components, cost, history. The form moved to
        // /edit so this route can be what "open the build" means.
        path: ':id',
        loadComponent: () =>
          import('./features/builds/containers/build-detail.page').then(
            (m) => m.BuildDetailPage,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/builds/containers/build-form.page').then(
            (m) => m.BuildFormPage,
          ),
      },
      {
        // Its own route: a side-by-side diff wants the full width, and the
        // build page is already long.
        path: ':id/compare',
        loadComponent: () =>
          import('./features/configs/containers/config-compare.page').then(
            (m) => m.ConfigComparePage,
          ),
      },
    ],
  },
  {
    path: 'parts',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/parts/containers/parts-list.page').then(
            (m) => m.PartsListPage,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/parts/containers/part-form.page').then(
            (m) => m.PartFormPage,
          ),
      },
      {
        // Read-only view. The card clamps a listing title to two lines and
        // shows four attributes; this is where the whole part lives.
        path: ':id',
        loadComponent: () =>
          import('./features/parts/containers/part-detail.page').then(
            (m) => m.PartDetailPage,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/parts/containers/part-form.page').then(
            (m) => m.PartFormPage,
          ),
      },
    ],
  },
  {
    // The logbook: imported flights, grouped into the outings they were flown in.
    path: 'flights',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/flights/containers/flights.page').then((m) => m.FlightsPage),
  },
  {
    // Places to fly: a map of them, and the collection beside it.
    path: 'spots',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/spots/containers/spots.page').then((m) => m.SpotsPage),
      },
      {
        // `?lat=&lng=` when a point was picked on the map first.
        path: 'new',
        loadComponent: () =>
          import('./features/spots/containers/spot-form.page').then(
            (m) => m.SpotFormPage,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/spots/containers/spot-detail.page').then(
            (m) => m.SpotDetailPage,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/spots/containers/spot-form.page').then(
            (m) => m.SpotFormPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
