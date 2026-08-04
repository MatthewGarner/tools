import {test} from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = globalThis.document || {
  createElement: () => ({getContext: () => ({})}),
};

const {
  PNG_MAX_ARTBOARD_AREA,
  PNG_MAX_ARTBOARD_SIDE,
  PNG_RASTER_SCALE,
  pngRasterPlan,
  svgToCanvas,
} = await import('../app-common.js');

test('PNG raster plan reads either quote style and attribute order from the root SVG', () => {
  assert.deepEqual(
    pngRasterPlan("<svg height='1080' viewBox='0 0 1920 1080' width='1920'><g/></svg>"),
    {ok: true, width: 1920, height: 1080, scale: 2, canvasWidth: 3840, canvasHeight: 2160},
  );
  assert.equal(PNG_RASTER_SCALE, 2);
});

test('PNG raster plan rejects absent, inherited, zero, and non-numeric root dimensions', () => {
  assert.equal(pngRasterPlan('<g/>').code, 'root');
  assert.equal(pngRasterPlan('<svg><rect width="10" height="10"/></svg>').code, 'dimensions');
  assert.equal(pngRasterPlan('<svg width="0" height="10"/>').code, 'dimensions');
  assert.equal(pngRasterPlan('<svg width="100%" height="10"/>').code, 'dimensions');
});

test('PNG raster budget is inclusive at its area and side boundaries', () => {
  const atArea = pngRasterPlan('<svg width="1500" height="2000"/>');
  const atSide = pngRasterPlan(`<svg width="${PNG_MAX_ARTBOARD_SIDE}" height="1"/>`);
  assert.equal(atArea.ok, true);
  assert.equal(1500 * 2000, PNG_MAX_ARTBOARD_AREA);
  assert.equal(atSide.ok, true);
  assert.equal(atSide.canvasWidth, PNG_MAX_ARTBOARD_SIDE * PNG_RASTER_SCALE);
});

test('PNG raster plan blocks artboards over either the area or side budget', () => {
  const overArea = pngRasterPlan('<svg width="1501" height="2000"/>');
  const overSide = pngRasterPlan(`<svg width="${PNG_MAX_ARTBOARD_SIDE + 1}" height="1"/>`);
  assert.equal(overArea.ok, false);
  assert.equal(overArea.code, 'area');
  assert.match(overArea.detail, /3,000,000 unit²/);
  assert.equal(overSide.ok, false);
  assert.equal(overSide.code, 'side');
  assert.match(overSide.detail, /4096px artboard-side/);
});

test('svgToCanvas refuses an over-budget artboard before constructing an Image', () => {
  let images = 0, failure;
  const PreviousImage = globalThis.Image;
  globalThis.Image = class { constructor(){ images += 1; } };
  try {
    const started = svgToCanvas('<svg width="2000" height="2000"/>',
      () => assert.fail('canvas callback must not run'), error => { failure = error; });
    assert.equal(started, false);
    assert.equal(images, 0);
    assert.equal(failure.code, 'area');
  }finally {
    globalThis.Image = PreviousImage;
  }
});
