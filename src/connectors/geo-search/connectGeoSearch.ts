import {
  checkRendering,
  aroundLatLngToPosition,
  insideBoundingBoxToBoundingBox,
  createDocumentationMessageGenerator,
  noop,
} from '../../lib/utils';
import {
  Connector,
  TransformItems,
  RenderOptions,
  InitOptions,
  Hit,
  RequiredKeys,
} from '../../types';
import { AlgoliaSearchHelper, SearchParameters } from 'algoliasearch-helper';

const withUsage = createDocumentationMessageGenerator({
  name: 'geo-search',
  connector: true,
});

export type LatLng = {
  /**
   * The latitude in degrees.
   */
  lat: number;
  /**
   * The longitude in degrees.
   */
  lng: number;
};

export type GeoSearchBounds = {
  /**
   * The top right corner of the map view.
   */
  northEast: LatLng;
  /**
   * The bottom left corner of the map view.
   */
  southWest: LatLng;
};

export type GeoSearchConnectorParamsItem = RequiredKeys<Hit, '_geoloc'>;

export type GeoSearchConnectorParams = {
  /**
   * If true, refine will be triggered as you move the map.
   */
  enableRefineOnMapMove?: boolean;

  /**
   * Function to transform the items passed to the templates.
   */
  transformItems?: TransformItems<GeoSearchConnectorParamsItem>;
};

export type GeoSearchRendererOptions = {
  /**
   * The matched hits from Algolia API.
   */
  items: GeoSearchConnectorParamsItem[];
  /**
   * The current position of the search.
   */
  position?: LatLng;
  /**
   * The current bounding box of the search.
   */
  currentRefinement?: GeoSearchBounds;
  /**
   * Sets a bounding box to filter the results from the given map bounds.
   */
  refine: (bounds: GeoSearchBounds) => void;
  /**
   * Reset the current bounding box refinement.
   */
  clearMapRefinement: () => void;
  /**
   * Returns true if the current refinement is set with the map bounds.
   */
  isRefinedWithMap: () => boolean;
  /**
   * Toggle the fact that the user is able to refine on map move.
   */
  toggleRefineOnMapMove: () => void;
  /**
   * Returns true if the user is able to refine on map move.
   */
  isRefineOnMapMove: () => boolean;
  /**
   * Set the fact that the map has moved since the last refinement, should be call on each map move.
   * The call to the function triggers a new rendering only when the value change.
   */
  setMapMoveSinceLastRefine: () => void;
  /**
   * Returns true if the map has move since the last refinement.
   */
  hasMapMoveSinceLastRefine: () => boolean;
};

export type GeoSearchConnector = Connector<
  GeoSearchRendererOptions,
  GeoSearchConnectorParams
>;

const connectGeoSearch: GeoSearchConnector = function connectGeoSearch(
  renderFn,
  unmountFn = noop
) {
  checkRendering(renderFn, withUsage());

  return widgetParams => {
    const { enableRefineOnMapMove = true, transformItems = items => items } =
      widgetParams || ({} as typeof widgetParams);

    type WidgetState = {
      isRefineOnMapMove: boolean;
      hasMapMoveSinceLastRefine: boolean;
      lastRefinePosition: string;
      lastRefineBoundingBox: number[][] | undefined;
      internalToggleRefineOnMapMove: () => void;
      internalSetMapMoveSinceLastRefine: () => void;
    };

    const widgetState: WidgetState = {
      isRefineOnMapMove: enableRefineOnMapMove,
      // @MAJOR hasMapMoveSinceLastRefine -> hasMapMovedSinceLastRefine
      hasMapMoveSinceLastRefine: false,
      lastRefinePosition: '',
      lastRefineBoundingBox: undefined,
      internalToggleRefineOnMapMove: noop,
      internalSetMapMoveSinceLastRefine: noop,
    };

    const getPositionFromState = (state: SearchParameters) =>
      state.aroundLatLng
        ? aroundLatLngToPosition(state.aroundLatLng)
        : undefined;

    const getCurrentRefinementFromState = (state: SearchParameters) =>
      state.insideBoundingBox &&
      insideBoundingBoxToBoundingBox(state.insideBoundingBox);

    const refine = (helper: AlgoliaSearchHelper) => ({
      northEast: ne,
      southWest: sw,
    }: GeoSearchBounds) => {
      const boundingBox = [[ne.lat, ne.lng, sw.lat, sw.lng]];

      helper.setQueryParameter('insideBoundingBox', boundingBox).search();

      widgetState.hasMapMoveSinceLastRefine = false;
      widgetState.lastRefineBoundingBox = boundingBox;
    };

    const clearMapRefinement = (helper: AlgoliaSearchHelper) => () => {
      helper.setQueryParameter('insideBoundingBox', undefined).search();
    };

    const isRefinedWithMap = (state: SearchParameters) => () =>
      Boolean(state.insideBoundingBox);

    const toggleRefineOnMapMove = () =>
      widgetState.internalToggleRefineOnMapMove();
    const createInternalToggleRefinementOnMapMove = <TArgs>(
      render: (args: TArgs) => void,
      args: TArgs
    ) => () => {
      widgetState.isRefineOnMapMove = !widgetState.isRefineOnMapMove;

      render(args);
    };

    const isRefineOnMapMove = () => widgetState.isRefineOnMapMove;

    const setMapMoveSinceLastRefine = () =>
      widgetState.internalSetMapMoveSinceLastRefine();
    const createInternalSetMapMoveSinceLastRefine = <TArgs>(
      render: (args: TArgs) => void,
      args: TArgs
    ) => () => {
      const shouldTriggerRender =
        widgetState.hasMapMoveSinceLastRefine !== true;

      widgetState.hasMapMoveSinceLastRefine = true;

      if (shouldTriggerRender) {
        render(args);
      }
    };

    const hasMapMoveSinceLastRefine = () =>
      widgetState.hasMapMoveSinceLastRefine;

    const init = (initArgs: InitOptions) => {
      const { state, helper, instantSearchInstance } = initArgs;
      const isFirstRendering = true;

      widgetState.internalToggleRefineOnMapMove = createInternalToggleRefinementOnMapMove(
        noop,
        initArgs
      );

      widgetState.internalSetMapMoveSinceLastRefine = createInternalSetMapMoveSinceLastRefine(
        noop,
        initArgs
      );

      renderFn(
        {
          items: [],
          position: getPositionFromState(state),
          currentRefinement: getCurrentRefinementFromState(state),
          refine: refine(helper),
          clearMapRefinement: clearMapRefinement(helper),
          isRefinedWithMap: isRefinedWithMap(state),
          toggleRefineOnMapMove,
          isRefineOnMapMove,
          setMapMoveSinceLastRefine,
          hasMapMoveSinceLastRefine,
          widgetParams,
          instantSearchInstance,
        },
        isFirstRendering
      );
    };

    const render = (renderArgs: RenderOptions) => {
      const { results, helper, instantSearchInstance } = renderArgs;
      const isFirstRendering = false;
      // We don't use the state provided by the render function because we need
      // to be sure that the state is the latest one for the following condition
      const state = helper.state;

      const positionChangedSinceLastRefine =
        Boolean(state.aroundLatLng) &&
        Boolean(widgetState.lastRefinePosition) &&
        state.aroundLatLng !== widgetState.lastRefinePosition;

      const boundingBoxChangedSinceLastRefine =
        !state.insideBoundingBox &&
        Boolean(widgetState.lastRefineBoundingBox) &&
        state.insideBoundingBox !== widgetState.lastRefineBoundingBox;

      if (positionChangedSinceLastRefine || boundingBoxChangedSinceLastRefine) {
        widgetState.hasMapMoveSinceLastRefine = false;
      }

      widgetState.lastRefinePosition = state.aroundLatLng || '';
      widgetState.lastRefineBoundingBox = state.insideBoundingBox || undefined;

      widgetState.internalToggleRefineOnMapMove = createInternalToggleRefinementOnMapMove(
        render,
        renderArgs
      );

      widgetState.internalSetMapMoveSinceLastRefine = createInternalSetMapMoveSinceLastRefine(
        render,
        renderArgs
      );

      const items = transformItems(results.hits.filter(hit => hit._geoloc));

      renderFn(
        {
          items,
          position: getPositionFromState(state),
          currentRefinement: getCurrentRefinementFromState(state),
          refine: refine(helper),
          clearMapRefinement: clearMapRefinement(helper),
          isRefinedWithMap: isRefinedWithMap(state),
          toggleRefineOnMapMove,
          isRefineOnMapMove,
          setMapMoveSinceLastRefine,
          hasMapMoveSinceLastRefine,
          widgetParams,
          instantSearchInstance,
        },
        isFirstRendering
      );
    };

    return {
      $$type: 'ais.geoSearch',

      init,

      render,

      dispose({ state }) {
        unmountFn();

        return state.setQueryParameter('insideBoundingBox', undefined);
      },

      getWidgetState(uiState, { searchParameters }) {
        const boundingBox = searchParameters.insideBoundingBox;

        if (!boundingBox) {
          return uiState;
        }

        return {
          ...uiState,
          geoSearch: {
            // @MAJOR change the UiState
            // from: 'number,number,number,number'
            // to: [number,number,number,number][]
            boundingBox: boundingBox.join(','),
          },
        };
      },

      getWidgetSearchParameters(searchParameters, { uiState }) {
        if (!uiState || !uiState.geoSearch) {
          return searchParameters.setQueryParameter(
            'insideBoundingBox',
            undefined
          );
        }

        return searchParameters.setQueryParameter('insideBoundingBox', [
          uiState.geoSearch.boundingBox.split(',').map(Number),
        ]);
      },
    };
  };
};

export default connectGeoSearch;
