/**
 * Angular ships its own packages partially compiled: the DI factories inside
 * them are declarations that the Angular linker finishes during a build. A
 * plain vitest run has no linker, so the first service pulled in from one of
 * them — importing `HttpErrorResponse` drags in `BrowserXhr` — asks for the
 * JIT compiler and dies without it.
 *
 * Loading the compiler here lets a logic test import anything from Angular.
 * It does not make these component tests: nothing here renders, and the
 * stores are still constructed by hand in an injection context.
 */
import '@angular/compiler';
