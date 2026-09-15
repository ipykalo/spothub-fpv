import { Injectable } from '@angular/core';

import type { LatLng } from './spot-style';

/** A position from the device, with how far off it may be. */
export interface DeviceFix extends LatLng {
  readonly accuracyM: number;
}

export type LocationFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

/** Why no fix came back, worded for the person holding the phone. */
export class LocationError extends Error {
  constructor(
    readonly reason: LocationFailure,
    message: string,
  ) {
    super(message);
    this.name = 'LocationError';
  }
}

/** A GPS fix at the field can take a while from a cold start. */
const FIX_TIMEOUT_MS = 20_000;

/**
 * The browser Geolocation API, behind a promise. The one place `navigator` is
 * asked where the device is, so a container can await a fix and a failure
 * arrives as a message rather than a numeric code.
 */
@Injectable({ providedIn: 'root' })
export class DeviceLocation {
  /** One fresh fix — never a cached one, since the point is where you stand now. */
  locate(): Promise<DeviceFix> {
    // Browsers only offer geolocation on HTTPS (and localhost).
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      return Promise.reject(
        new LocationError(
          'unsupported',
          'This browser cannot share its location here. Drop a pin on the map instead.',
        ),
      );
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracyM: Math.round(position.coords.accuracy),
          });
        },
        (error) => {
          reject(toLocationError(error));
        },
        { enableHighAccuracy: true, timeout: FIX_TIMEOUT_MS, maximumAge: 0 },
      );
    });
  }
}

function toLocationError(error: GeolocationPositionError): LocationError {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new LocationError(
        'denied',
        'Location is blocked for this site. Allow it in the browser, or drop a pin on the map.',
      );
    case error.TIMEOUT:
      return new LocationError(
        'timeout',
        'Getting a GPS fix took too long. Try again, or drop a pin on the map.',
      );
    default:
      return new LocationError(
        'unavailable',
        'No GPS fix right now. Try again in the open, or drop a pin on the map.',
      );
  }
}
