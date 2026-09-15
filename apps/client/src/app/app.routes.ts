import { type Route } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';
import { publicBuildResolver, publicBuildsResolver } from './features/builds/public-build.resolvers';
import { postResolver, publishedPostsResolver } from './features/posts/posts.resolvers';

/**
 * Every route is lazily loaded, so the login screen does not ship the hangar
 * and the initial bundle stays small.
 *
 * `builds` and `blog` are the public pages: no guard, rendered on the server
 * (`app.routes.server.ts`), and everything they show resolved before they
 * render so the browser picks up the server's page rather than drawing its own.
 */
export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'hangar' },
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
  {
    // Public: every build shared as Public, and any shared build's own page.
    // The slug is only for people reading the link; the id finds the build.
    path: 'builds',
    children: [
      {
        path: '',
        resolve: { builds: publicBuildsResolver },
        loadComponent: () =>
          import('./features/builds/containers/public-builds.page').then(
            (m) => m.PublicBuildsPage,
          ),
      },
      {
        path: ':id',
        resolve: { view: publicBuildResolver },
        loadComponent: () =>
          import('./features/builds/containers/public-build.page').then(
            (m) => m.PublicBuildPage,
          ),
      },
      {
        path: ':id/:slug',
        resolve: { view: publicBuildResolver },
        loadComponent: () =>
          import('./features/builds/containers/public-build.page').then(
            (m) => m.PublicBuildPage,
          ),
      },
    ],
  },
  {
    // Public: the blog and its posts.
    path: 'blog',
    children: [
      {
        path: '',
        resolve: { posts: publishedPostsResolver },
        loadComponent: () =>
          import('./features/posts/containers/blog.page').then((m) => m.BlogPage),
      },
      {
        path: ':id',
        resolve: { post: postResolver },
        loadComponent: () =>
          import('./features/posts/containers/post.page').then((m) => m.PostPage),
      },
      {
        path: ':id/:slug',
        resolve: { post: postResolver },
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
          import('./features/posts/containers/post-form.page').then((m) => m.PostFormPage),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/posts/containers/post-form.page').then((m) => m.PostFormPage),
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
          import('./features/spots/containers/spot-form.page').then((m) => m.SpotFormPage),
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
          import('./features/spots/containers/spot-form.page').then((m) => m.SpotFormPage),
      },
    ],
  },
  { path: '**', redirectTo: 'hangar' },
];
