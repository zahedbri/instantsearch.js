/* global google */
import { AlgoliaHit } from '../../types';

type Coordinate = {
  x: number;
  y: number;
};

interface MapsEventListener {
  /**
   * Removes the listener. Equivalent to calling
   * google.maps.event.removeListener(listener).
   */
  remove(): void;
}

type Args = {
  __id: string;
  position: AlgoliaHit['_geoLoc'];
  map: google.maps.Map;
  template: string;
  className: string;
  anchor?: Coordinate;
};

function createHTMLMarker(
  googleReference: typeof google
): new (args: Args) => google.maps.OverlayView {
  // googleReference: TGoogle
  class HTMLMarker extends googleReference.maps.OverlayView {
    public __id: string;
    public anchor: Coordinate;
    public listeners: { [key: string]: EventListener };
    public latLng: google.maps.LatLng;
    public element: HTMLElement;
    public offset: Coordinate = { x: 0, y: 0 };

    public constructor({
      __id,
      position,
      map,
      template,
      className,
      anchor = {
        x: 0,
        y: 0,
      },
    }: Args) {
      super();

      this.__id = __id;
      this.anchor = anchor;
      this.listeners = {};
      this.latLng = new googleReference.maps.LatLng(position!);

      this.element = document.createElement('div');
      this.element.className = className;
      this.element.style.position = 'absolute';
      this.element.innerHTML = template;

      this.setMap(map);
    }

    public onAdd() {
      // Append the element to the map
      this.getPanes().overlayMouseTarget.appendChild(this.element);

      // Compute the offset onAdd & cache it because afterwards
      // it won't retrieve the correct values, we also avoid
      // to read the values on every draw
      const bbBox = this.element.getBoundingClientRect();

      this.offset = {
        x: this.anchor.x + bbBox.width / 2,
        y: this.anchor.y + bbBox.height,
      };

      // Force the width of the element will avoid the
      // content to collapse when we move the map
      this.element.style.width = `${bbBox.width}px`;
    }

    public draw() {
      const position = this.getProjection().fromLatLngToDivPixel(this.latLng);

      this.element.style.left = `${Math.round(position.x - this.offset.x)}px`;
      this.element.style.top = `${Math.round(position.y - this.offset.y)}px`;

      // Markers to the south are in front of markers to the north
      // This is the default behavior of Google Maps
      this.element.style.zIndex = parseInt(
        this.element.style.top,
        10
      ).toString();

      return this.getMap();
    }

    public onRemove() {
      if (this.element) {
        this.element.parentNode!.removeChild(this.element);

        Object.keys(this.listeners).forEach(eventName => {
          this.element.removeEventListener(
            eventName,
            this.listeners[eventName]
          );
        });

        delete this.element;
        delete this.listeners;
      }
    }

    public addListener(
      eventName: string,
      listener: (...args: any[]) => void
    ): MapsEventListener {
      this.listeners[eventName] = listener;

      this.element.addEventListener(eventName, listener);

      return {
        remove: () => this.element.removeEventListener(eventName, listener),
      };
    }

    public getPosition() {
      return this.latLng;
    }
  }

  return HTMLMarker;
}

export default createHTMLMarker;
