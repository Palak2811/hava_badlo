/** Camera commands the React UI can send to the Phaser scene (replaced by the scene on create). */
type ZoomBy = (factor: number) => void;
type FocusTile = (x: number, y: number, zoom?: number) => void;

const noop = () => undefined;

export const cityControls: { zoomBy: ZoomBy; reset: () => void; focusTile: FocusTile } = {
  zoomBy: noop,
  reset: noop,
  focusTile: noop,
};
