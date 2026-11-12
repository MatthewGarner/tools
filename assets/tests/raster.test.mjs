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
    {ok: true, width: 1920, height: 1080, scale: 2, reduced: false, canvasWidth: 3840, canvasHeight: 2160},
  );
  assert.equal(PNG_RASTER_SCALE, 2);
});

test('PNG raster plan rejects absent, inherited, zero, and non-numeric root dimensions', () => {
  assert.equal(pngRasterPlan('<g/>').code, 'root');
  assert.equal(pngRasterPlan('<svg><rect width="10" height="10"/></svg>').code, 'dimensions');
  assert.equal(pngRasterPlan('<svg width="0" height="10"/>').code, 'dimensions');
  assert.equal(pngRasterPlan('<svg width="100%" height="10"/>').code, 'dimensions');
});

test('a picture too large for 2x is drawn at a lower scale, never below 1x', () => {
  const small = pngRasterPlan('<svg width="1500" height="2000"/>');
  assert.equal(small.scale, 2);
  assert.equal(small.reduced, false);
  // the old budget refused this: 45-item roadmaps are about 1440 x 6000
  const tall = pngRasterPlan('<svg width="1440" height="6000"/>');
  assert.equal(tall.ok, true);
  assert.ok(tall.scale > 1 && tall.scale < 2, 'reduced: ' + tall.scale);
  assert.equal(tall.reduced, true);
  assert.ok(tall.canvasWidth * tall.canvasHeight <= PNG_MAX_ARTBOARD_AREA, 'inside the Safari canvas limit');
  const huge = pngRasterPlan('<svg width="4096" height="4096"/>');
  assert.equal(huge.scale, 1);
  assert.equal(huge.canvasWidth * huge.canvasHeight, PNG_MAX_ARTBOARD_AREA);
});

test('PNG raster plan refuses only what cannot be made at 1x', () => {
  const overArea = pngRasterPlan('<svg width="4097" height="4097"/>');
  const overSide = pngRasterPlan(`<svg width="${PNG_MAX_ARTBOARD_SIDE + 1}" height="1"/>`);
  assert.equal(overArea.ok, false);
  assert.equal(overArea.code, 'area');
  assert.match(overArea.detail, /16,777,216-pixel canvas limit even at 1x/);
  assert.equal(overSide.ok, false);
  assert.equal(overSide.code, 'side');
  assert.equal(pngRasterPlan(`<svg width="${PNG_MAX_ARTBOARD_SIDE}" height="1"/>`).ok, true);
});

test('svgToCanvas refuses an over-budget artboard before constructing an Image', () => {
  let images = 0, failure;
  const PreviousImage = globalThis.Image;
  globalThis.Image = class { constructor(){ images += 1; } };
  try {
    const started = svgToCanvas('<svg width="5000" height="5000"/>',
      () => assert.fail('canvas callback must not run'), error => { failure = error; });
    assert.equal(started, false);
    assert.equal(images, 0);
    assert.equal(failure.code, 'area');
  }finally {
    globalThis.Image = PreviousImage;
  }
});
