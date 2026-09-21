import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeviceLocation, LocationError } from './device-location';

/**
 * Where the phone is, for "Add location" at the field.
 *
 * The whole point of this class is that a container never sees a numeric
 * geolocation code: every refusal arrives as a reason and a sentence someone
 * standing in a field can act on. Geolocation also needs a secure context,
 * which is worth failing on clearly rather than leaving a button that does
 * nothing over plain HTTP.
 */
describe('DeviceLocation', () => {
  interface Coords {
    latitude: number;
    longitude: number;
    accuracy: number;
  }

  /** The codes the browser uses, as `GeolocationPositionError` carries them. */
  const CODES = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };

  function browser(
    options: {
      secure?: boolean;
      geolocation?: boolean;
      fix?: Coords;
      failWith?: number;
    } = {},
  ): { options: unknown } {
    const asked: unknown[] = [];

    const geolocation = {
      getCurrentPosition(
        onFix: (position: { coords: Coords }) => void,
        onFailure: (error: unknown) => void,
        settings: unknown,
      ): void {
        asked.push(settings);

        if (options.failWith !== undefined) {
          onFailure({ ...CODES, code: options.failWith });
          return;
        }

        onFix({
          coords: options.fix ?? {
            latitude: 50.4501,
            longitude: 30.5234,
            accuracy: 12.4,
          },
        });
      },
    };

    vi.stubGlobal('window', { isSecureContext: options.secure ?? true });
    vi.stubGlobal('navigator', options.geolocation === false ? {} : { geolocation });

    return {
      get options(): unknown {
        return asked[0];
      },
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('answers with the fix, rounding the accuracy to whole metres', async () => {
    browser({ fix: { latitude: 50.4501, longitude: 30.5234, accuracy: 12.4 } });

    await expect(new DeviceLocation().locate()).resolves.toEqual({
      lat: 50.4501,
      lng: 30.5234,
      accuracyM: 12,
    });
  });

  it('asks for a fresh fix, never a cached one: the point is where you stand now', async () => {
    const stage = browser();

    await new DeviceLocation().locate();

    expect(stage.options).toMatchObject({ enableHighAccuracy: true, maximumAge: 0 });
  });

  it('gives up waiting rather than leaving the button spinning at the field', async () => {
    const stage = browser();

    await new DeviceLocation().locate();

    expect(stage.options).toMatchObject({ timeout: 20_000 });
  });

  describe('when there is no fix to be had', () => {
    const reasonOf = async (failWith: number): Promise<LocationError> => {
      browser({ failWith });

      return await new DeviceLocation()
        .locate()
        .then(() => {
          throw new Error('expected a refusal');
        })
        .catch((error: unknown) => error as LocationError);
    };

    it('says location is blocked, and what to do instead', async () => {
      const error = await reasonOf(CODES.PERMISSION_DENIED);

      expect(error).toBeInstanceOf(LocationError);
      expect(error.reason).toBe('denied');
      expect(error.message).toContain('drop a pin');
    });

    it('says the fix took too long', async () => {
      expect((await reasonOf(CODES.TIMEOUT)).reason).toBe('timeout');
    });

    it('treats anything else as no fix right now', async () => {
      expect((await reasonOf(CODES.POSITION_UNAVAILABLE)).reason).toBe('unavailable');
    });

    it('refuses outright over plain HTTP, where the browser will not answer at all', async () => {
      browser({ secure: false });

      await expect(new DeviceLocation().locate()).rejects.toMatchObject({
        reason: 'unsupported',
      });
    });

    it('refuses the same way in a browser with no geolocation', async () => {
      browser({ geolocation: false });

      await expect(new DeviceLocation().locate()).rejects.toMatchObject({
        reason: 'unsupported',
      });
    });
  });
});
