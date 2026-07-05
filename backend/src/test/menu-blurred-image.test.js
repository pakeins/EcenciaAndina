import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
let makeSquareWithBlurredBackground;

beforeAll(() => {
  const menuRoute = require('../routes/menu.js');
  makeSquareWithBlurredBackground = menuRoute._private.makeSquareWithBlurredBackground;
});

describe('makeSquareWithBlurredBackground', () => {
  it('debe mantener una imagen cuadrada sin cambios', async () => {
    // Crear una imagen de 100x100
    const squareBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).png().toBuffer();

    const outputBuffer = await makeSquareWithBlurredBackground(squareBuffer);
    const metadata = await sharp(outputBuffer).metadata();

    expect(metadata.width).toBe(100);
    expect(metadata.height).toBe(100);
  });

  it('debe transformar una imagen rectangular horizontal en una cuadrada usando la dimension maxima', async () => {
    // Crear una imagen de 200x100 (horizontal)
    const rectBuffer = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 0, g: 255, b: 0 }
      }
    }).png().toBuffer();

    const outputBuffer = await makeSquareWithBlurredBackground(rectBuffer);
    const metadata = await sharp(outputBuffer).metadata();

    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(200);
  });

  it('debe transformar una imagen rectangular vertical en una cuadrada usando la dimension maxima', async () => {
    // Crear una imagen de 100x300 (vertical)
    const rectBuffer = await sharp({
      create: {
        width: 100,
        height: 300,
        channels: 3,
        background: { r: 0, g: 0, b: 255 }
      }
    }).png().toBuffer();

    const outputBuffer = await makeSquareWithBlurredBackground(rectBuffer);
    const metadata = await sharp(outputBuffer).metadata();

    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(300);
  });
});
