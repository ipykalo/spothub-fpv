/**
 * YouTube's public surface: the covers modules store, and the thumbnail port
 * the e2e suite stands in for.
 *
 * `YouTubeThumbnails` is an abstract class and therefore a runtime value — it
 * is the DI token the e2e suite overrides, so it must not be exported as a type.
 */
export { YouTubeThumbnails } from './abstract/youtube-thumbnails';
export { VideoCovers } from './video-covers';
export { YouTubeModule } from './youtube.module';
