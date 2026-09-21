/**
 * Just enough of a document for the head-writing services.
 *
 * `PageMeta` and `StructuredData` put a canonical link and a JSON-LD block
 * into the head, which is real behaviour worth testing — but the client's
 * suite runs in Node with no DOM, and booting one for two services that touch
 * four DOM methods between them would cost more than it proves. This stands in
 * for those four, and lives under `__fixtures__` so coverage ignores it.
 */

export interface FakeElement {
  id: string;
  textContent: string | null;
  readonly tagName: string;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  remove(): void;
}

export interface FakeHead {
  readonly children: readonly FakeElement[];
  appendChild(element: FakeElement): void;
  querySelector(selector: string): FakeElement | null;
}

export interface FakeDocument {
  readonly head: FakeHead;
  createElement(tagName: string): FakeElement;
  getElementById(id: string): FakeElement | null;
}

/** `tag[attr="value"]` and nothing else — the only shape these services use. */
function matches(element: FakeElement, selector: string): boolean {
  const parsed = /^([a-z]+)(?:\[([a-z-]+)="([^"]*)"\])?$/.exec(selector);

  if (!parsed) {
    return false;
  }

  if (element.tagName !== parsed[1]) {
    return false;
  }

  // The attribute group is optional, so it may not have taken part.
  const attribute = parsed.at(2);

  return attribute === undefined || element.getAttribute(attribute) === parsed.at(3);
}

export function fakeDocument(): FakeDocument {
  const children: FakeElement[] = [];

  return {
    head: {
      children,
      appendChild(element: FakeElement): void {
        children.push(element);
      },
      querySelector(selector: string): FakeElement | null {
        return children.find((child) => matches(child, selector)) ?? null;
      },
    },
    createElement(tagName: string): FakeElement {
      const attributes: Record<string, string> = {};
      const element: FakeElement = {
        id: '',
        textContent: null,
        tagName,
        setAttribute(name: string, value: string): void {
          attributes[name] = value;
        },
        getAttribute(name: string): string | null {
          return attributes[name] ?? null;
        },
        remove(): void {
          const at = children.indexOf(element);

          if (at !== -1) {
            children.splice(at, 1);
          }
        },
      };

      return element;
    },
    getElementById(id: string): FakeElement | null {
      return children.find((child) => child.id === id) ?? null;
    },
  };
}
